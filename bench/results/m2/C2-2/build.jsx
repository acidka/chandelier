// Builder: px coords measured on reference (page origin 36,8; 0.5 pt/px)
var D0=AIA.doc(); while(D0.pageItems.length) D0.pageItems[0].remove();
function X(px){return (px-36)*0.5;}
function Y(py){return (py-8)*0.5;}
AIA.swatch("Navy","cmyk(100,85,30,30)");
AIA.swatch("Red","cmyk(5,100,90,5)");
AIA.swatch("WeekGrey","cmyk(0,0,0,55)");
AIA.swatch("RuleGrey","cmyk(0,0,0,30)");
var R="Arial", B="Arial Bold";
var hdr=["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];
function dcol(i){return i>=5?"swatch:Red":"cmyk(0,0,0,100)";}

AIA.layer("Main month");
var gt=AIA.group("Title");
AIA.text("Січень",{x:X(140),y:Y(182),font:B,size:62,color:"swatch:Navy",name:"Month name",parent:gt});
AIA.text("2027",{x:X(1117),y:Y(182),font:B,size:54,color:"swatch:Navy",align:"right",name:"Year",parent:gt});
AIA.line(X(120),Y(216),X(1118),Y(216),{stroke:"swatch:Navy",sw:1.5,name:"Title rule",parent:gt});

var cx=[318,444,570,695,820,946,1071];
var gh=AIA.group("Weekday header");
AIA.text("Тиждень",{x:X(176),y:Y(279),font:B,size:12,color:"swatch:Navy",align:"center",name:"Week label",parent:gh});
for(var i=0;i<7;i++) AIA.text(hdr[i],{x:X(cx[i]),y:Y(280),font:B,size:17,color:i>=5?"swatch:Red":"cmyk(0,0,0,100)",align:"center",name:"Head "+hdr[i],parent:gh});

var gw=AIA.group("Week numbers");
var gd=AIA.group("Dates");
var gr=AIA.group("Row rules");
var wk=[53,1,2,3,4], base=[378,476,572,669,767];
var d=1;
for(var r=0;r<5;r++){
  AIA.text(String(wk[r]),{x:X(175),y:Y(base[r]-5),font:R,size:22,color:"swatch:WeekGrey",align:"center",name:"Week "+wk[r],parent:gw});
  for(var c=(r==0?4:0);c<7 && d<=31;c++){
    AIA.text(String(d),{x:X(cx[c]),y:Y(base[r]),font:R,size:30,color:dcol(c),align:"center",name:"Jan "+d,parent:gd});
    d++;
  }
  if(r<4) AIA.line(X(112),Y(base[r]+26),X(1128),Y(base[r]+26),{stroke:"swatch:RuleGrey",sw:1,name:"Rule "+(r+1),parent:gr});
}

AIA.layer("Mini months");
function mini(name,title,tx,rx1,rx2,cols,start,days){
  var g=AIA.group(name);
  AIA.text(title,{x:X(tx),y:Y(887),font:B,size:21,color:"swatch:Navy",name:name+" title",parent:g});
  AIA.line(X(rx1),Y(910),X(rx2),Y(910),{stroke:"swatch:Navy",sw:1,name:name+" rule",parent:g});
  for(var i=0;i<7;i++) AIA.text(hdr[i],{x:X(cols[i]),y:Y(950),font:B,size:12,color:i>=5?"swatch:Red":"cmyk(0,0,0,100)",align:"center",name:name+" "+hdr[i],parent:g});
  var bl=[1004,1049,1094,1139,1183];
  var c=start,r=0;
  for(var dd=1;dd<=days;dd++){
    AIA.text(String(dd),{x:X(cols[c]),y:Y(bl[r]),font:c>=5?B:R,size:14,color:dcol(c),align:"center",name:name+" "+dd,parent:g});
    c++; if(c>6){c=0;r++;}
  }
  return g;
}
mini("December 2026","Грудень 2026",90,72,540,[106,172,239,305,372,439,506],1,31);
mini("February 2027","Лютий 2027",654,636,1117,[671,739,808,876,945,1013,1081],0,28);
AIA.line(X(588),Y(862),X(588),Y(1206),{stroke:"swatch:RuleGrey",sw:1,name:"Mini divider"});
// remove default empty layers
var doc=AIA.doc();
for(var i=doc.layers.length-1;i>=0;i--){ if(doc.layers[i].pageItems.length==0 && doc.layers[i].layers.length==0) doc.layers[i].remove(); }
return "ok";
