var d=null;for(var i=0;i<app.documents.length;i++)if(app.documents[i].name=="M2-A2.ai")d=app.documents[i];
var o=["docs="+app.documents.length,"mode="+d.documentColorSpace,"artboards="+d.artboards.length,"rect="+d.artboards[0].artboardRect,
"layers="+d.layers.length+" "+d.layers[0].name,"text="+d.textFrames.length,"paths="+d.pathItems.length,"raster="+d.rasterItems.length,"placed="+d.placedItems.length,"compound="+d.compoundPathItems.length];
var fonts={},rgb=0,empty=0;for(i=0;i<d.textFrames.length;i++){var t=d.textFrames[i];fonts[t.textRange.characterAttributes.textFont.name]=1;if(t.contents=="")empty++;
 var fc=t.textRange.characterAttributes.fillColor;if(fc.typename=="RGBColor")rgb++;}
for(i=0;i<d.pathItems.length;i++){if(d.pathItems[i].strokeColor.typename=="RGBColor")rgb++;}
var g=[];for(i=0;i<d.groupItems.length;i++){if(d.groupItems[i].pageItems.length==0)empty++;g.push(d.groupItems[i].name);}
o.push("fonts="+[].concat((function(){var a=[];for(var k in fonts)a.push(k);return a})()));o.push("rgb="+rgb+" empty="+empty);o.push("groups="+g.join("|"));
var tx=[];var gm=d.groupItems.getByName("Main grid");var w=gm.groupItems.getByName("Week numbers");for(i=w.textFrames.length-1;i>=0;i--)tx.push(w.textFrames[i].contents);o.push("weeks="+tx);
o.join("\n");
