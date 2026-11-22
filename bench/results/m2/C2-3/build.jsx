// Builder: calendar January 2027 (Ukrainian). Reference px -> pt: (px-36)*0.5, (py-8)*0.5
function X(px){return (px-36)*0.5;}
function Y(py){return (py-8)*0.5;}
var F_B="Arial Bold", F_R="Arial";
AIA.swatch("Navy","cmyk(100,85,30,25)");
AIA.swatch("Red","cmyk(5,100,95,10)");
AIA.swatch("Grey","cmyk(0,0,0,55)");
AIA.swatch("RuleGrey","cmyk(0,0,0,30)");
AIA.swatch("Ink","cmyk(0,0,0,95)");
var NAVY="swatch:Navy",RED="swatch:Red",GREY="swatch:Grey",RG="swatch:RuleGrey",INK="swatch:Ink";
var dn=["Пн","Вт","Ср","Чт","Пт","Сб","Нд"];

// ---------- Main month ----------
AIA.layer("Main month");
var gT=AIA.group("Title");
AIA.text("Січень",{x:X(140),y:Y(182),font:F_B,size:61,color:NAVY,name:"Month name",parent:gT});
AIA.text("2027",{x:X(1116),y:Y(182),font:F_B,size:61,color:NAVY,align:"right",name:"Year",parent:gT});
AIA.line(X(120),Y(216),X(1118),Y(216),{stroke:NAVY,sw:1.5,name:"Title rule",parent:gT});

var cols=[318,444,570,695,820,946,1071];
var gH=AIA.group("Weekday header");
AIA.text("Тиждень",{x:X(176),y:Y(279),font:F_B,size:12,color:NAVY,align:"center",name:"Week label",parent:gH});
for(var i=0;i<7;i++) AIA.text(dn[i],{x:X(cols[i]),y:Y(280),font:F_B,size:17,color:(i>=5?RED:INK),align:"center",name:"Day "+dn[i],parent:gH});

var gG=AIA.group("Day grid");
var gW=AIA.group("Week numbers",gG), gD=AIA.group("Dates",gG), gR=AIA.group("Row rules",gG);
var rows=[377,475,571,669,766], weeks=["53","1","2","3","4"];
// Jan 1 2027 = Friday (col 4)
var d=1;
for(var r=0;r<5;r++){
  AIA.text(weeks[r],{x:X(175),y:Y(rows[r]),font:F_R,size:22,color:GREY,align:"center",name:"Week "+weeks[r],parent:gW});
  for(var c=(r==0?4:0);c<7 && d<=31;c++,d++){
    AIA.text(""+d,{x:X(cols[c]),y:Y(rows[r]),font:F_R,size:33,color:(c>=5?RED:INK),align:"center",name:"Jan "+d,parent:gD});
  }
}
var rl=[404,501,599,696];
for(var k=0;k<4;k++) AIA.line(X(112),Y(rl[k]),X(1128),Y(rl[k]),{stroke:RG,sw:1,name:"Row rule "+(k+1),parent:gR});

// ---------- Mini months ----------
AIA.layer("Mini months");
function mini(name,title,tx,ruleX1,ruleX2,mcols,startCol,days){
  var g=AIA.group(name);
  AIA.text(title,{x:X(tx),y:Y(886),font:F_B,size:20,color:NAVY,name:"Title",parent:g});
  AIA.line(X(ruleX1),Y(910),X(ruleX2),Y(910),{stroke:NAVY,sw:1,name:"Rule",parent:g});
  var h=AIA.group("Header",g);
  for(var i=0;i<7;i++) AIA.text(dn[i],{x:X(mcols[i]),y:Y(950),font:F_B,size:12,color:(i>=5?RED:INK),align:"center",name:dn[i],parent:h});
  var dg=AIA.group("Dates",g);
  var rb=[1004,1049,1094,1139,1184];
  var c=startCol,r=0;
  for(var dd=1;dd<=days;dd++){
    var we=c>=5;
    AIA.text(""+dd,{x:X(mcols[c]),y:Y(rb[r]),font:(we?F_B:F_R),size:14,color:(we?RED:INK),align:"center",name:""+dd,parent:dg});
    c++; if(c>6){c=0;r++;}
  }
  return g;
}
// Dec 1 2026 = Tuesday (col 1); Feb 1 2027 = Monday (col 0), 28 days
mini("December 2026","Грудень 2026",90,72,540,[106,172,238,305,372,439,506],1,31);
mini("February 2027","Лютий 2027",654,636,1117,[670,739,808,876,945,1013,1082],0,28);
AIA.line(X(588),Y(862),X(588),Y(1206),{stroke:RG,sw:1,name:"Divider"});
// remove default empty layers
var doc=AIA.doc();
for(var L=doc.layers.length-1;L>=0;L--){ if(doc.layers[L].pageItems.length==0 && doc.layers.length>1) doc.layers[L].remove(); }
return "ok";
