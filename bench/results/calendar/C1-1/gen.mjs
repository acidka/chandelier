import fs from 'fs';
const MON=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const DAYS=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const rects=[[0,0],[323,0],[646,0],[969,0],[0,236],[323,236],[646,236],[969,236],[0,472],[323,472],[646,472],[969,472]];
const pad=n=>String(n).padStart(2,'0');
function isoWeek(d){const t=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()));const day=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-day+3);const fy=new Date(Date.UTC(t.getUTCFullYear(),0,4));return 1+Math.round(((t-fy)/864e5-3+((fy.getUTCDay()+6)%7))/7);}
function monthInfo(y,m){const first=new Date(Date.UTC(y,m,1));const off=(first.getUTCDay()+6)%7;const n=new Date(Date.UTC(y,m+1,0)).getUTCDate();return {off,n,rows:Math.ceil((off+n)/7)};}
const steps=[];
for(let mi=0;mi<12;mi++){
  const [ox,oy]=rects[mi]; const L=`${pad(mi+1)}_${MON[mi]}`; const Y=2027;
  const T=[]; const S=[];
  T.push({text:MON[mi],x:ox+127.5,y:oy+28.5,paragraph_style:'Title',name:'Month title'});
  T.push({text:'2027',x:ox+287.5,y:oy+28.5,paragraph_style:'Year',name:'Year'});
  S.push({shape:'line',x1:ox+125.5,y1:oy+34.5,x2:ox+288,y2:oy+34.5,stroke:'swatch:Navy',stroke_width:1.7,name:'Title rule'});
  T.push({text:'Тиждень',x:ox+132.7,y:oy+44.8,paragraph_style:'Week label',name:'Week label'});
  const cx0=157.2,dx=20.35;
  DAYS.forEach((d,i)=>T.push({text:d,x:ox+cx0+i*dx,y:oy+45,paragraph_style:i>=5?'Weekday weekend':'Weekday',name:'Weekday '+d}));
  const {off,n,rows}=monthInfo(Y,mi);
  const dy=Math.min(16.13,80.65/rows); const b0=61.2;
  for(let r=0;r<rows;r++){
    const by=oy+b0+r*dy;
    // week number: date of Monday of this row
    const mon=new Date(Date.UTC(Y,mi,1-off+r*7));
    T.push({text:String(isoWeek(mon)),x:ox+132.7,y:by-0.6,paragraph_style:'Week number',name:'Week '+(r+1)});
    if(r<rows-1) S.push({shape:'line',x1:ox+122.5,y1:by+4.3,x2:ox+289.4,y2:by+4.3,stroke:'swatch:Rule grey',stroke_width:0.75,name:'Row rule '+(r+1)});
  }
  for(let d=1;d<=n;d++){const p=off+d-1;const r=Math.floor(p/7),c=p%7;
    T.push({text:String(d),x:ox+cx0+c*dx,y:oy+b0+r*dy,paragraph_style:c>=5?'Date weekend':'Date',name:'Date '+pad(d)});}
  // minis
  const minis=[[mi===0?2026:Y,(mi+11)%12,115.9,'Prev'],[mi===11?2028:Y,(mi+1)%12,209.6,'Next']];
  for(const [my,mm,rx,tag] of minis){
    T.push({text:`${MON[mm]} ${my}`,x:ox+rx+3.2,y:oy+144.8,paragraph_style:'Mini title',name:`${tag} mini title`});
    S.push({shape:'line',x1:ox+rx,y1:oy+148.6,x2:ox+rx+78,y2:oy+148.6,stroke:'swatch:Navy',stroke_width:1,name:`${tag} mini rule`});
    const mcx=rx+5,mdx=11.2;
    DAYS.forEach((d,i)=>T.push({text:d,x:ox+mcx+i*mdx,y:oy+155.2,paragraph_style:i>=5?'Mini weekday weekend':'Mini weekday',name:`${tag} weekday ${d}`}));
    const inf=monthInfo(my,mm);
    for(let d=1;d<=inf.n;d++){const p=inf.off+d-1;const r=Math.floor(p/7),c=p%7;
      T.push({text:String(d),x:ox+mcx+c*mdx,y:oy+164.1+r*7.4,paragraph_style:c>=5?'Mini date weekend':'Mini date',name:`${tag} date ${pad(d)}`});}
  }
  S.push({shape:'line',x1:ox+200.8,y1:oy+140.6,x2:ox+200.8,y2:oy+194.8,stroke:'swatch:Rule grey',stroke_width:0.75,name:'Mini separator'});
  steps.push({tool:'create_shape',args:{layer:L,items:S}});
  steps.push({tool:'create_text',args:{layer:L,items:T}});
}
fs.writeFileSync(new URL('./steps.json',import.meta.url),JSON.stringify(steps));
console.log(steps.length, [0,4,7].map(m=>monthInfo(2027,m)));
