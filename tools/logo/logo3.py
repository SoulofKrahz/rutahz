# Logo de Rutahz: silueta de Mallorca + ruta de Palma a Manacor (inicio ● y destino ○, como en la app)
import json,math,sys,subprocess,os
ring=json.load(open(os.path.join(os.path.dirname(__file__),'fx/mallorca.json')))
K=math.cos(math.radians(39.61))
lon0,lon1=min(c[0] for c in ring),max(c[0] for c in ring); la0,la1=min(c[1] for c in ring),max(c[1] for c in ring)
W=(lon1-lon0)*K; H=la1-la0; s=52/W
P=lambda lon,lat:(32+((lon-lon0)*K-W/2)*s, 33-((lat-la0)-H/2)*s)
ISL='M'+'L'.join('%.2f %.2f'%P(*c) for c in ring)+'Z'
a,b,c=P(2.650,39.572),P(2.911,39.720),P(3.209,39.569)
ROUTE='M%.1f %.1fQ%.1f %.1f %.1f %.1fT%.1f %.1f'%(a[0],a[1],a[0]+3,b[1]+2,b[0],b[1],c[0],c[1])
def inner(ink, rc, css=False):
    # css=True: colores desde variables (para el símbolo dentro de la app)
    f=lambda prop,v,var: f'style="{prop}:var({var},{v})"' if css else f'{prop}="{v}"'
    return (f'<path d="{ISL}" {f("fill",ink,"--lgn")}/>'
            f'<path d="{ROUTE}" fill="none" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" {f("stroke",rc,"--lgr")}/>'
            f'<circle cx="{a[0]:.1f}" cy="{a[1]:.1f}" r="2.8" {f("fill",rc,"--lgr")}/>'
            f'<circle cx="{c[0]:.1f}" cy="{c[1]:.1f}" r="2.9" stroke-width="2.2" {f("fill",ink,"--lgn")} {f("stroke",rc,"--lgr")}/>')
if __name__=='__main__':
    if sys.argv[1]=='symbol':
        print('<g id="logo64"><rect width="64" height="64" rx="15" style="fill:var(--em2)"/>'+inner('#06150f','#fff',True)+'</g>'); sys.exit()
    cols=json.loads(sys.argv[1]); out=sys.argv[2]
    def render(sv,p,px):
        open(p+'.svg','w').write(sv); subprocess.run(['rsvg-convert','-w',str(px),'-h',str(px),p+'.svg','-o',p],check=True); os.remove(p+'.svg')
    for co in cols:
        ink='#fff' if co['lt'] else '#06150f'; rc=co['e2'] if co['lt'] else '#fff'; fill=co['e2']; g=inner(ink,rc)
        base=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="15" fill="{fill}"/>{g}</svg>'
        apple=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{fill}"/>{g}</svg>'
        mask=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="{fill}"/><g transform="translate(8 8) scale(.75)">{g}</g></svg>'
        k=co['k']
        if not k:
            open(os.path.join(out,'icono.svg'),'w').write(base)
            render(base,os.path.join(out,'icon-192.png'),192); render(base,os.path.join(out,'icon-512.png'),512)
            render(mask,os.path.join(out,'icon-maskable-512.png'),512); render(apple,os.path.join(out,'apple-touch-icon.png'),180)
        else:
            d=os.path.join(out,'ic')
            render(base,f'{d}/{k}-192.png',192); render(base,f'{d}/{k}-512.png',512); render(mask,f'{d}/{k}-mask.png',512); render(apple,f'{d}/{k}-apple.png',180)
    print('iconos ok')
