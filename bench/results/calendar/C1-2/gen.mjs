import fs from 'node:fs';
const M=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WD=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const rects=[[0,0],[323,0],[646,0],[969,0],[0,236],[323,236],[646,236],[969,236],[0,472],[323,472],[646,472],[969,472]];
const dim=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
const dow=(y,m,d)=>(new Date(Date.UTC(y,m,d)).getUTCDay()+6)%7; // Mon=0
function isoWeek(y,m,d){const t=new Date(Date.UTC(y,m,d));const dn=(t.getUTCDay()+6)%7;t.setUTCDate(t.getUTCDate()-dn+3);const fy=t.getUTCFullYear();const j4=new Date(Date.UTC(fy,0,4));return 1+Math.round(((t-j4)/864e5-3+((j4.getUTCDay()+6)%7))/7);}
function weeks(y,m){const n=dim(y,m),s=dow(y,m,1);const rows=[];let row=new Array(7).fill(null);let c=s;for(let d=1;d<=n;d++){row[c]=d;c++;if(c==7){rows.push(row);row=new Array(7).fill(null);c=0;}}if(c>0)rows.push(row);return rows;}
const steps=[];
steps.push(...[
 ['Navy','cmyk(100,85,30,25)'],['Red','cmyk(0,100,100,5)'],['Ink','cmyk(0,0,0,90)'],['Grey','cmyk(0,0,0,50)'],['Rule','cmyk(0,0,0,25)']
].map(([name,color])=>({tool:'swatches',args:{action:'add',kind:'global',name,color}})));
const ps=(name,font,size,fill,align,extra={})=>({tool:'styles',args:{action:'create',kind:'paragraph',name,font,size,fill:'swatch:'+fill,align,leading:'auto',...extra}});
steps.push(
 ps('Month Title','MontserratRoman-Bold',62,'Navy','left',{tracking:-10}),
 ps('Year','MontserratRoman-Bold',56,'Navy','right',{tracking:-10}),
 ps('Week Label','MontserratRoman-Bold',10,'Navy','center'),
 ps('Weekday','MontserratRoman-SemiBold',17,'Ink','center'),
 ps('Weekday Weekend','MontserratRoman-SemiBold',17,'Red','center'),
 ps('Date','MontserratRoman-Medium',31,'Ink','center'),
 ps('Date Weekend','MontserratRoman-Medium',31,'Red','center'),
 ps('Week Number','MontserratRoman-Regular',20,'Grey','center'),
 ps('Mini Title','MontserratRoman-Bold',19,'Navy','left'),
 ps('Mini Weekday','MontserratRoman-SemiBold',11,'Ink','center'),
 ps('Mini Weekday Weekend','MontserratRoman-SemiBold',11,'Red','center'),
 ps('Mini Date','MontserratRoman-Medium',14,'Ink','center'),
 ps('Mini Date Weekend','MontserratRoman-Medium',14,'Red','center'),
);
fs.writeFileSync(new URL('./setup.json',import.meta.url),JSON.stringify({steps}));
const r=v=>Math.round(v*100)/100;
const Y=2027;
for(let i=0;i<12;i++){
 const s=[];const [ox,oy]=rects[i];const L=String(i+1).padStart(2,'0')+'_'+M[i];
 const T=(text,x,y,st)=>({text:String(text),x:r(ox+x),y:r(oy+y),paragraph_style:st,align:st.match(/Title/)?'left':st=='Year'?'right':'center'});
 const add=(tool,args,gname)=>{s.push({tool,args:{layer:L,...args}});return s.length-1;};
 const groups=[];
 // header
 let a=add('create_text',{items:[T(M[i],127.6,28.9,'Month Title'),T(Y,287.6,28.9,'Year')]});
 let b=add('create_shape',{shape:'line',x1:r(ox+125.6),y1:r(oy+34.7),x2:r(ox+288.2),y2:r(oy+34.7),stroke:'swatch:Navy',stroke_width:1.75,name:'Title rule'});
 groups.push([[a,b],'Header']);
 // weekday headers
 const hx=k=>157.2+k*20.33;
 a=add('create_text',{items:[T('Тиждень',132.7,45.0,'Week Label'),...WD.map((w,k)=>T(w,hx(k),45.0,k>=5?'Weekday Weekend':'Weekday'))]});
 groups.push([[a],'Weekdays']);
 const W=weeks(Y,i);const n=W.length;const pitch=n>=6?12.9:16.1;
 const dates=[],wn=[],lines=[];
 W.forEach((row,ri)=>{const by=61.2+ri*pitch;const fd=row.find(d=>d);
  wn.push(T(isoWeek(Y,i,fd),132.7,by,'Week Number'));
  row.forEach((d,k)=>{if(d)dates.push(T(d,hx(k),by,k>=5?'Date Weekend':'Date'));});
  if(ri<n-1){const ly=r(oy+by+pitch/2-3.7);lines.push({x1:r(ox+122.6),y1:ly,x2:r(ox+289.6),y2:ly});}
 });
 a=add('create_text',{items:dates});groups.push([[a],'Dates']);
 a=add('create_text',{items:wn});groups.push([[a],'Week numbers']);
 a=add('create_shape',{shape:'line',stroke:'swatch:Rule',stroke_width:0.75,items:lines});groups.push([[a],'Row rules']);
 // minis
 const mini=(y,m,x0,ruleX1,ruleX2,cx0,gname)=>{
  const ws=weeks(y,m);const it=[T(M[m]+' '+y,x0,144.7,'Mini Title')];
  WD.forEach((w,k)=>it.push(T(w,cx0+k*11.06,155.3,k>=5?'Mini Weekday Weekend':'Mini Weekday')));
  ws.forEach((row,ri)=>row.forEach((d,k)=>{if(d)it.push(T(d,cx0+k*11.06,164.4+ri*7.4,k>=5?'Mini Date Weekend':'Mini Date'));}));
  const t=add('create_text',{items:it});
  const l=add('create_shape',{shape:'line',x1:r(ox+ruleX1),y1:r(oy+148.7),x2:r(ox+ruleX2),y2:r(oy+148.7),stroke:'swatch:Navy',stroke_width:1,name:'Mini rule'});
  groups.push([[t,l],gname]);return ws.length;};
 const pm=i==0?[Y-1,11]:[Y,i-1], nm=i==11?[Y+1,0]:[Y,i+1];
 const r1=mini(pm[0],pm[1],119.0,115.8,192.9,121.0,'Mini previous');
 const r2=mini(nm[0],nm[1],211.3,209.0,288.0,215.0,'Mini next');
 const rows=Math.max(r1,r2);
 a=add('create_shape',{shape:'line',x1:r(ox+200.9),y1:r(oy+140.7),x2:r(ox+200.9),y2:r(oy+164.4+(rows-1)*7.4+1.5),stroke:'swatch:Rule',stroke_width:0.75,name:'Mini divider'});
 groups.push([[a],'Divider']);
 for(const [idx,name] of groups){ if(idx.length>1||true) s.push({tool:'arrange_items',args:{action:'group',refs:idx.map(j=>'@'+j),name:name}}); }
 fs.writeFileSync(new URL(`./month${String(i+1).padStart(2,'0')}.json`,import.meta.url),JSON.stringify({steps:s}));
 console.log(L,n,'rows; first week',isoWeek(Y,i,1), 'prev',pm,'next',nm);
}
