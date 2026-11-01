// Replica de nzAcc (noticiahz) para calcular el color del icono de cada acento
function nzAcc(h,s){
 var C=function(h,s,l){s=Math.max(0,Math.min(1,s));l=l/100;var a=s*Math.min(l,1-l),f=function(n){var k=(n+h/30)%12;return l-a*Math.max(-1,Math.min(k-3,9-k,1))};return[f(0),f(8),f(4)]};
 var hx=function(r){return'#'+r.map(function(v){return('0'+Math.round(v*255).toString(16)).slice(-2)}).join('')};
 var Lm=function(r){var q=r.map(function(v){return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)});return .2126*q[0]+.7152*q[1]+.0722*q[2]};
 var cr=function(a,b){var x=Lm(a),y=Lm(b);return(Math.max(x,y)+.05)/(Math.min(x,y)+.05)};
 var W=[1,1,1],N=function(x){return[parseInt(x.slice(1,3),16)/255,parseInt(x.slice(3,5),16)/255,parseInt(x.slice(5,7),16)/255]};
 var bg=N('#f4f6fa');
 var l=34;while(l>10&&cr(C(h,s,l),W)<5.6)l--;var em=C(h,s,l);
 var l2=Math.min(l+7,42);while(l2>l&&cr(C(h,s,l2),bg)<3.2)l2--;var e2=C(h,s,l2);
 var K=N('#06150f'),lt=cr(e2,K)<2.6;
 return {em:hx(em),e2:hx(e2),lt:lt};
}
const P=[['',null,null],['turquesa',185,.85],['azul',214,.9],['indigo',243,.8],['violeta',272,.7],['rosa',328,.75],['coral',6,.85],['naranja',27,.95],['ambar',42,.95],['grafito',215,.12]];
const out=P.map(([k,h,s])=>k?{k,...nzAcc(h,s)}:{k:'',em:'#047857',e2:'#0a9d5c',lt:false});
console.log(JSON.stringify(out));
