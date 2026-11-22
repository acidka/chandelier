import fs from 'fs';
const out = process.argv[2]; const only = process.argv[3] ? process.argv[3].split(',').map(Number) : null;
const MONTHS=['Січень','Лютий','Березень','Квітень','Травень','Червень','Липень','Серпень','Вересень','Жовтень','Листопад','Грудень'];
const WD=['Пн','Вт','Ср','Чт','Пт','Сб','Нд'];
const dim=(y,m)=>new Date(Date.UTC(y,m+1,0)).getUTCDate();
const dow=(y,m,d)=>(new Date(Date.UTC(y,m,d)).getUTCDay()+6)%7; // Mon=0
function isoWeek(dt){const d=new Date(dt);const day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day+3);const y=d.getUTCFullYear();const j4=new Date(Date.UTC(y,0,4));const w1=new Date(j4);w1.setUTCDate(j4.getUTCDate()-((j4.getUTCDay()+6)%7));return 1+Math.round((d-w1)/(7*864e5))+ (0);}
function weeks(y,m){const s=dow(y,m,1),n=dim(y,m);const rows=[];let row=new Array(7).fill('');for(let d=1;d<=n;d++){const c=(s+d-1)%7;row[c]=String(d);if(c===6||d===n){rows.push(row);row=new Array(7).fill('');}}return rows;}
const steps=[];
// swatches + styles
const sw=[['Navy','cmyk(100,85,30,25)'],['Red','cmyk(5,100,100,0)'],['Text Black','cmyk(0,0,0,90)'],['Week Grey','cmyk(0,0,0,50)'],['Rule Grey','cmyk(0,0,0,25)'],['Photo Grey','cmyk(16,10,6,0)']];
const SETUP=!process.argv[4];
if(SETUP)for(const [n,c] of sw) steps.push({tool:'swatches',args:{action:'add',kind:'global',name:n,color:c}});
const st=[
 ['Month Title',{font:'Montserrat Bold',size:54,fill:'swatch:Navy',align:'left'}],
 ['Year Title',{font:'Montserrat SemiBold',size:47,fill:'swatch:Navy',align:'right'}],
 ['Week Header',{font:'Montserrat Bold',size:11,fill:'swatch:Navy',align:'center'}],
 ['Weekday',{font:'Montserrat SemiBold',size:18,fill:'swatch:Text Black',align:'center'}],
 ['Weekday Weekend',{font:'Montserrat SemiBold',size:18,fill:'swatch:Red',align:'center'}],
 ['Week Number',{font:'Montserrat Regular',size:24,fill:'swatch:Week Grey',align:'center'}],
 ['Date',{font:'Montserrat Medium',size:32,fill:'swatch:Text Black',align:'center'}],
 ['Date Weekend',{font:'Montserrat Medium',size:32,fill:'swatch:Red',align:'center'}],
 ['Mini Title',{font:'Montserrat Bold',size:18,fill:'swatch:Navy',align:'left'}],
 ['Mini Weekday',{font:'Montserrat SemiBold',size:12,fill:'swatch:Text Black',align:'center'}],
 ['Mini Weekday Weekend',{font:'Montserrat SemiBold',size:12,fill:'swatch:Red',align:'center'}],
 ['Mini Date',{font:'Montserrat Medium',size:14,fill:'swatch:Text Black',align:'center'}],
 ['Mini Date Weekend',{font:'Montserrat SemiBold',size:14,fill:'swatch:Red',align:'center'}],
];
if(SETUP)for(const [n,p] of st) steps.push({tool:'styles',args:{action:'create',kind:'paragraph',name:n,...p}});
if(SETUP){steps.push({tool:'layers',args:{action:'add',name:'Photo',activate:false}});
steps.push({tool:'layers',args:{action:'add',name:'Calendar'}});}
const L='Calendar';
function add(s){steps.push(s);return '@'+(steps.length-1);}
function mini(ab,y,m,x0,tag,mm){
  const refs=[];
  refs.push(add({tool:'create_text',artboard:ab,args:{layer:L,text:`${MONTHS[m]} ${y}`,x:x0.title,y:144.9,paragraph_style:'Mini Title',name:`${mm} ${tag} title`}}));
  refs.push(add({tool:'create_shape',artboard:ab,args:{layer:L,shape:'line',x1:x0.r1,y1:148.7,x2:x0.r2,y2:148.7,stroke:'swatch:Navy',stroke_width:1,name:`${mm} ${tag} rule`}}));
  const cp={'5':{paragraph_style:'Mini Weekday Weekend'},'6':{paragraph_style:'Mini Weekday Weekend'}};
  refs.push(add({tool:'create_text',artboard:ab,args:{layer:L,paragraph_style:'Mini Weekday',grid:{x:x0.c,y:155.5,cols:7,dx:11.1,dy:0,cells:WD,col_props:cp}}}));
  const cells=weeks(y,m).flat();
  refs.push(add({tool:'create_text',artboard:ab,args:{layer:L,paragraph_style:'Mini Date',grid:{x:x0.c,y:164.5,cols:7,dx:11.1,dy:7.5,cells,col_props:{'5':{paragraph_style:'Mini Date Weekend'},'6':{paragraph_style:'Mini Date Weekend'}}}}}));
  add({tool:'arrange_items',args:{action:'group',refs,name:`${mm} Mini ${tag}`}});
}
const Y=2027;
for(let m=0;m<12;m++){
  if(only&&!only.includes(m))continue;
  const ab=m, mm=String(m+1).padStart(2,'0');
  add({tool:'create_shape',artboard:ab,args:{layer:'Photo',x:-3,y:-3,w:118.2,h:216,fill:'swatch:Photo Grey',stroke:'none',name:`${mm} Photo area (empty)`}});
  // header
  const h=[];
  h.push(add({tool:'create_text',artboard:ab,args:{layer:L,items:[{text:MONTHS[m],x:127.6,y:28.5,paragraph_style:'Month Title',name:`${mm} Month`},{text:String(Y),x:288,y:28.5,paragraph_style:'Year Title',name:`${mm} Year`}]}}));
  h.push(add({tool:'create_shape',artboard:ab,args:{layer:L,shape:'line',x1:125.6,y1:34.7,x2:288.2,y2:34.7,stroke:'swatch:Navy',stroke_width:1.7,name:`${mm} Title rule`}}));
  add({tool:'arrange_items',args:{action:'group',refs:h,name:`${mm} Header`}});
  // main grid
  const g=[]; const cx=157.3, dx=20.32;
  g.push(add({tool:'create_text',artboard:ab,args:{layer:L,text:'Тиждень',x:132.7,y:45,paragraph_style:'Week Header',name:`${mm} Week header`}}));
  g.push(add({tool:'create_text',artboard:ab,args:{layer:L,paragraph_style:'Weekday',grid:{x:cx,y:45.2,cols:7,dx,dy:0,cells:WD,col_props:{'5':{paragraph_style:'Weekday Weekend'},'6':{paragraph_style:'Weekday Weekend'}}}}}));
  const rows=weeks(Y,m); const r=rows.length; const dy=Math.min(16.05,64.2/(r-1)); const b0=61.4;
  g.push(add({tool:'create_text',artboard:ab,args:{layer:L,paragraph_style:'Date',grid:{x:cx,y:b0,cols:7,dx,dy,cells:rows.flat(),col_props:{'5':{paragraph_style:'Date Weekend'},'6':{paragraph_style:'Date Weekend'}}}}}));
  const wk=rows.map((row,i)=>{const first=row.findIndex(v=>v!=='');const d=Number(row[first]);const dt=Date.UTC(Y,m,d);return {text:String(isoWeek(dt)),x:132.7,y:+(b0+i*dy-0.9).toFixed(2)};});
  g.push(add({tool:'create_text',artboard:ab,args:{layer:L,paragraph_style:'Week Number',items:wk}}));
  const rl=[];for(let i=0;i<r-1;i++){const yy=+(b0+i*dy+dy/2-3.9).toFixed(2);rl.push({x1:122.6,y1:yy,x2:289.6,y2:yy});}
  if(rl.length) g.push(add({tool:'create_shape',artboard:ab,args:{layer:L,shape:'line',stroke:'swatch:Rule Grey',stroke_width:0.75,items:rl}}));
  add({tool:'arrange_items',args:{action:'group',refs:g,name:`${mm} Main grid`}});
  // minis
  const py=m===0?Y-1:Y, pm=(m+11)%12, ny=m===11?Y+1:Y, nm=(m+1)%12;
  mini(ab,py,pm,{title:119,r1:115.8,r2:192.9,c:121.0},'prev',mm);
  mini(ab,ny,nm,{title:211.3,r1:208.7,r2:288,c:214.3},'next',mm);
  add({tool:'create_shape',artboard:ab,args:{layer:L,shape:'line',x1:200.9,y1:140.9,x2:200.9,y2:194.9,stroke:'swatch:Rule Grey',stroke_width:0.75,name:`${mm} Mini divider`}});
}
fs.writeFileSync(out,JSON.stringify({steps}));
console.log(steps.length);
