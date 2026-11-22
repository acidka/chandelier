// Only non-ASCII is escaped: \uXXXX is valid ES3 inside strings, regexes, comments and identifiers,
// and the AppleScript string literal carries plain ASCII (newlines included) unchanged.
export const ascii = (s: string): string =>
  s.replace(/[^\x00-\x7e]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
