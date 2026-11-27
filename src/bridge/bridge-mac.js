// Persistent macOS bridge to Adobe Illustrator.
// Runs as ONE long-lived `osascript -l JavaScript` process for the lifetime of the MCP server.
//
// Protocol (newline-delimited JSON):
//   stdin  ← {"id":1,"op":"js","code":"...","timeout":120}
//            {"id":2,"op":"activate"}
//            {"id":3,"op":"running"}   (also launch, quit)
//   stdout → {"id":1,"ok":true,"result":"..."}
//            {"id":1,"ok":false,"error":"...","errno":-1712}
//
// Why not JXA's Application('Adobe Illustrator').doJavascript()? It cannot set an AppleEvent timeout
// (fixed ~120 s), and big builds take longer. So each request compiles a tiny AppleScript with
// `with timeout of N seconds` in-process via NSAppleScript; the compile costs ~1 ms, not a process spawn.
// The JSX payload is ASCII-only (the Node side escapes non-ASCII), so quoting it is trivial.

ObjC.import('Foundation');

var BUNDLE_ID = 'com.adobe.illustrator';
var stdin = $.NSFileHandle.fileHandleWithStandardInput;
var stdout = $.NSFileHandle.fileHandleWithStandardOutput;

function send(obj) {
  var s = JSON.stringify(obj) + '\n';
  stdout.writeData($(s).dataUsingEncoding($.NSUTF8StringEncoding));
}

// "Is it running?" is checked inside AppleScript (`application id … is running` never launches the app).
// NSRunningApplication from JXA was unreliable here: without a run loop its list goes stale and
// reported "not running" mid-session (seen 2026-11-22).
var NOT_RUNNING = 'not running';
// The app id is a VARIABLE on purpose: with a literal `tell application id "…"` AppleScript resolves the app when the
// script is COMPILED, which launches Illustrator even inside "if … is running" (seen 2026-11-22, quirk C11).
// CHANDELIER_APP=/Applications/Adobe Illustrator 2025/Adobe Illustrator.app targets one install when several are
// there (every version has the same bundle id); default: the bundle id (whichever version macOS picks)
var APP_PATH = ObjC.unwrap($.NSProcessInfo.processInfo.environment.objectForKey('CHANDELIER_APP')) || '';
var APP = APP_PATH
  ? 'set aiaId to (POSIX file "' + APP_PATH.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '") as text\n'
  : 'set aiaId to "' + BUNDLE_ID + '"\n';
var TARGET = APP_PATH ? 'application aiaId' : 'application id aiaId';
function ifRunning(body) {
  return APP + 'if ' + TARGET + ' is running then\n' + body + '\nelse\n' +
    'return "' + '\u0001AIA_ERR\u0001' + '-600|' + NOT_RUNNING + '"\nend if';
}

function asString(s) {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Errors are caught INSIDE the AppleScript (`try … on error`) and returned as a marked string.
// Reason: reading NSAppleScript's error out-parameter through a JXA Ref() segfaults osascript
// (exit 139, seen 2026-11-22 on macOS 27.2), which killed the bridge and left callers waiting.
var ERR_MARK = '\u0001AIA_ERR\u0001';

function runAppleScript(body) {
  var src = 'try\n' + body + '\non error errMsg number errNum\n' +
    'return "' + ERR_MARK + '" & errNum & "|" & errMsg\nend try';
  var script = $.NSAppleScript.alloc.initWithSource(src);
  var desc = script.executeAndReturnError(null);
  if (!desc || desc.isNil()) return { ok: false, error: 'AppleScript failed without a message', errno: null };
  var str = desc.stringValue;
  var out = (str && !str.isNil()) ? ObjC.unwrap(str) : '';
  if (out.indexOf(ERR_MARK) === 0) {
    var rest = out.slice(ERR_MARK.length);
    var bar = rest.indexOf('|');
    return { ok: false, errno: Number(rest.slice(0, bar)), error: rest.slice(bar + 1) };
  }
  return { ok: true, result: out };
}

// a path that doesn't exist would make AppleScript ask "Where is …?" (a dialog nobody answers): refuse instead
var APP_MISSING = APP_PATH && !$.NSFileManager.defaultManager.fileExistsAtPath(APP_PATH);

function handle(req) {
  if (APP_MISSING) return { ok: false, error: 'CHANDELIER_APP: no application at ' + APP_PATH + ' (give the path of "Adobe Illustrator.app")', errno: -600 };
  if (req.op === 'running') {
    return runAppleScript(APP + 'if ' + TARGET + ' is running then\nreturn "yes"\nelse\nreturn "no"\nend if');
  }
  if (req.op === 'activate') {
    return runAppleScript(ifRunning('tell ' + TARGET + ' to activate\nreturn "ok"'));
  }
  if (req.op === 'launch') {
    return runAppleScript(APP + 'tell ' + TARGET + ' to launch\nreturn "ok"');
  }
  if (req.op === 'quit') {
    // status {restart}: sent only when no document has unsaved changes, so Illustrator asks nothing
    return runAppleScript(ifRunning('tell ' + TARGET + ' to quit\nreturn "ok"'));
  }
  if (req.op === 'js') {
    // Never auto-launch Illustrator by accident: a bare `tell application` would start it.
    var t = Math.max(1, Math.round(req.timeout || 300));
    // Raw event code of "do javascript" (miscDjxM, from Illustrator's .sdef): with a variable app id there is no
    // dictionary at compile time, so the term can't be used.
    var src = 'with timeout of ' + t + ' seconds\n' +
      'tell ' + TARGET + ' to return \u00abevent miscDjxM\u00bb ' + asString(req.code) + '\n' +
      'end timeout';
    return runAppleScript(ifRunning(src));
  }
  return { ok: false, error: 'unknown op ' + req.op };
}

var buf = '';
send({ id: 0, ok: true, result: 'ready' });
while (true) {
  var data = stdin.availableData;
  if (Number(data.length) === 0) break; // parent closed stdin → exit
  buf += ObjC.unwrap($.NSString.alloc.initWithDataEncoding(data, $.NSUTF8StringEncoding));
  var nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    var line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    if (!line.trim()) continue;
    var req;
    try { req = JSON.parse(line); } catch (e) { send({ id: -1, ok: false, error: 'bad json: ' + e.message }); continue; }
    var res;
    try { res = handle(req); } catch (e) { res = { ok: false, error: String(e && e.message || e) }; }
    res.id = req.id;
    send(res);
  }
}
