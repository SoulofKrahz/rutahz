const fs=require('fs');const out=process.argv[2];
const cols=JSON.parse(require('child_process').execSync('node '+__dirname+'/colors.js').toString());
for(const c of cols){
  const ic=c.k?`ic/${c.k}-`:'icon-';
  const m={id:'./',name:'Rutahz',short_name:'Rutahz',description:'Kilometraje de tus rutas de visitas: paradas, kilómetros reales, historial e informes.',lang:'es',dir:'ltr',
    start_url:'./',scope:'./',display:'standalone',orientation:'any',background_color:'#f4f6fa',theme_color:c.e2,categories:['productivity','business','navigation'],
    icons:[{src:ic+'192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:ic+'512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:c.k?`ic/${c.k}-mask.png`:'icon-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'}],
    shortcuts:[
      {name:'Añadir parada',short_name:'Parada',description:'Abrir la ruta de hoy para añadir una parada',url:'./?a=add',icons:[{src:ic+'192.png',sizes:'192x192',type:'image/png'}]},
      {name:'Historial',short_name:'Historial',description:'Jornadas guardadas',url:'./?a=hist',icons:[{src:ic+'192.png',sizes:'192x192',type:'image/png'}]},
      {name:'Informe del mes',short_name:'Informe',description:'Informe imprimible del mes en curso',url:'./?a=report',icons:[{src:ic+'192.png',sizes:'192x192',type:'image/png'}]}],
    related_applications:[{platform:'webapp',url:'https://rutahz.pages.dev/manifest.webmanifest'}]};
  fs.writeFileSync(`${out}/manifest${c.k?'-'+c.k:''}.webmanifest`,JSON.stringify(m,null,2));
}
console.log('ok');
