import fs from 'fs';
const OUT = process.argv[2];
const MONTHS = ['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WD = ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const rects = [[0,0],[323,0],[646,0],[969,0],[0,236],[323,236],[646,236],[969,236],[0,472],[323,472],[646,472],[969,472]];
const dow = (y,m,d) => (new Date(Date.UTC(y,m,d)).getUTCDay()+6)%7; // Mon=0
const dim = (y,m) => new Date(Date.UTC(y,m+1,0)).getUTCDate();
function isoWeek(y,m,d){ const t=new Date(Date.UTC(y,m,d)); const dn=(t.getUTCDay()+6)%7; t.setUTCDate(t.getUTCDate()-dn+3); const fy=t.getUTCFullYear(); const f=new Date(Date.UTC(fy,0,4)); return 1+Math.round(((t-f)/864e5-3+((f.getUTCDay()+6)%7))/7); }
function weeks(y,m){ const s=dow(y,m,1), n=dim(y,m); const rows=[]; let r=new Array(7).fill(null); for(let d=1;d<=n;d++){ const c=(s+d-1)%7; r[c]=d; if(c===6||d===n){rows.push(r); r=new Array(7).fill(null);} } return rows; }
const steps=[];
const r2=v=>Math.round(v*100)/100;
for(let m=0;m<12;m++){
  const [ox,oy]=rects[m]; const L=`${String(m+1).padStart(2,'0')}_${MONTHS[m]}`;
  const T=[], S=[];
  const t=(text,x,y,ps,name,align)=>T.push({text:String(text),x:r2(ox+x),y:r2(oy+y),paragraph_style:ps,name,...(align?{align}:{})});
  t(MONTHS[m],127.5,28.9,'Title','Month title','left');
  t('2027',287.5,28.9,'Year','Year','right');
  S.push({shape:'line',x1:ox+125.5,y1:oy+34.7,x2:ox+288,y2:oy+34.7,stroke:'swatch:Navy',stroke_width:1.7,name:'Title rule'});
  t('Тиждень',132.7,44.8,'WeekLabel','Week label','center');
  WD.forEach((w,i)=>t(w,157.2+i*20.35,44.8,i>=5?'DayHeaderWeekend':'DayHeader','Header '+w,'center'));
  const rows=weeks(2027,m); const n=rows.length; const dy= n>=6? (125.7-61.4)/5 : 16.07;
  rows.forEach((r,ri)=>{ const by=61.4+ri*dy; const fd=r.find(v=>v!==null);
    t(isoWeek(2027,m,fd),132.7,by-0.8,'WeekNumber','Week '+isoWeek(2027,m,fd),'center');
    r.forEach((d,c)=>{ if(d!==null) t(d,157.2+c*20.35,by,c>=5?'DateWeekend':'Date','Day '+d,'center'); });
    if(ri<n-1) S.push({shape:'line',x1:ox+122.5,y1:r2(oy+by+dy*0.262),x2:ox+289.4,y2:r2(oy+by+dy*0.262),stroke:'swatch:Rule Grey',stroke_width:0.75,name:'Row rule '+(ri+1)});
  });
  // minis
  const mini=(y,mm,x0,ruleX0,ruleX1,cx0,cdx,tag)=>{
    t(`${MONTHS[mm]} ${y}`,x0,144.8,'MiniTitle',tag+' title','left');
    S.push({shape:'line',x1:ox+ruleX0,y1:oy+148.6,x2:ox+ruleX1,y2:oy+148.6,stroke:'swatch:Navy',stroke_width:1,name:tag+' rule'});
    WD.forEach((w,i)=>t(w,cx0+i*cdx,155.2,i>=5?'MiniHeaderWeekend':'MiniHeader',tag+' header '+w,'center'));
    const rr=weeks(y,mm);
    rr.forEach((r,ri)=>r.forEach((d,c)=>{ if(d!==null) t(d,cx0+c*cdx,164.3+ri*7.45,c>=5?'MiniDateWeekend':'MiniDate',tag+' day '+d,'center'); }));
    return rr.length;
  };
  const pm = m===0?[2026,11]:[2027,m-1]; const nm = m===11?[2028,0]:[2027,m+1];
  const a=mini(pm[0],pm[1],119.1,115.7,192.8,120.9,11.06,'Prev month');
  const b=mini(nm[0],nm[1],211.2,208.8,287.6,214.0,11.33,'Next month');
  const mr=Math.max(a,b);
  S.push({shape:'line',x1:ox+200.8,y1:oy+140.6,x2:ox+200.8,y2:r2(oy+164.3+(mr-1)*7.45+3),stroke:'swatch:Rule Grey',stroke_width:0.75,name:'Mini divider'});
  steps.push({tool:'create_shape',args:{layer:L,items:S}});
  steps.push({tool:'create_text',args:{layer:L,items:T}});
}
fs.writeFileSync(OUT,JSON.stringify({steps}));
console.log(steps.length, steps.reduce((a,s)=>a+s.args.items.length,0));
for(let m=0;m<12;m++) console.log(m+1, weeks(2027,m).length, isoWeek(2027,m,1));
