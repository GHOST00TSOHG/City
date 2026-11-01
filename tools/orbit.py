import json,sys,math
# orbit.py x0 x1 z0 z1 h out.json [extra.json]
x0,x1,z0,z1,h=map(float,sys.argv[1:6]);cx,cz=(x0+x1)/2,(z0+z1)/2;R=max(x1-x0,z1-z0)
v=[]
for k in range(8):
  a=k*math.pi/4;dx,dz=math.sin(a),-math.cos(a)  # k=0 front(-Z)
  nm=['front','corner-FR','side-R','corner-BR','back','corner-BL','side-L','corner-FL'][k]
  v.append([f'orb-street-{nm}',[cx+dx*R*0.9,1.7,cz+dz*R*0.9],[cx,h*0.3,cz],0,1])
  v.append([f'orb-close-{nm}',[cx+dx*(abs(x1-x0)/2*abs(dx)+abs(z1-z0)/2*abs(dz)+6),1.7,cz+dz*(abs(x1-x0)/2*abs(dx)+abs(z1-z0)/2*abs(dz)+6)],[cx,h*0.5,cz],0,1])
  if k%2: v.append([f'orb-high-{nm}',[cx+dx*R*0.8,h*1.3,cz+dz*R*0.8],[cx,h*0.25,cz],0,1])
v.append(['orb-top',[cx+0.01,h+R*1.1,cz+0.01],[cx,0,cz],0,1])
v.append(['orb-night-corner-FR',[cx+R*0.64,6,cz-R*0.64],[cx,h*0.3,cz],0,0])
v.append(['orb-night-corner-BL',[cx-R*0.64,6,cz+R*0.64],[cx,h*0.3,cz],0,0])
if len(sys.argv)>7: v+=json.load(open(sys.argv[7]))
json.dump(v,open(sys.argv[6],'w'));print(len(v))
