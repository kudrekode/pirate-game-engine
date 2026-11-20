"""Additional reusable meshes. Called with the same batched mesh writer as the cottage."""
from math import sin, cos, pi
from mathutils import Vector


def build_shore(kit):
    rng=kit.rng
    beam,block,stone,roof,cylinder=kit.beam,kit.block,kit.stone,kit.roof,kit.cylinder
    tau=2*pi

    def well():
        # Separate voussoirs leave an open shaft and mortar between stones.
        for row in range(4):
            r=.77 if row<3 else .86
            for i in range(12):
                a=(i+row*.5)*tau/12
                b=a+tau/12
                ring=[(radius*cos(angle),radius*sin(angle))
                      for radius,angle in [(r,a+.009),(r,b-.009),(r-.245,b-.009),(r-.245,a+.009)]]
                kit.mesh.solid([[(x*s,y*s,row*.21+z) for x,y in ring] for s,z in
                                [(.98,.002),(1,.02),(1,.18),(.98,.208)]],"quarry stone",rng.uniform(.7,1.12))
        cylinder(0,0,.09,[(0,.55),(.02,.55)],"recess",18)
        for x in (-.67,.67):
            beam((x,0,.77),(x+.025,0,2.27),.14)
            for sign in (-1,1): beam((x,0,1.79),(x,sign*.55,2.15),.086)
        beam((-.87,0,1.49),(.88,0,1.49),.12,sides=10)
        beam((.87,0,1.49),(.88,.12,1.27),.065,mat="iron")
        beam((.88,.12,1.27),(1.06,.12,1.27),.07)
        beam((.06,0,1.5),(.06,0,.67),.025,mat="reed brass",sides=6)
        cylinder(.06,0,.52,[(0,.115),(.24,.155)],"hewn oak")
        roof(0,0,1.08,1.64,2.05,2.83,.025)

    def lantern():
        cylinder(0,0,0,[(0,.28),(.12,.30),(.42,.21)],"fieldstone",8)
        beam((0,0,.30),(-.06,0,2.9),.18)
        beam((-.18,0,2.70),(.98,.01,2.78),.14)
        beam((-.02,0,2.05),(.62,0,2.73),.10)
        beam((.81,0,2.73),(.81,0,2.42),.033,mat="iron",sides=7)
        cylinder(.81,0,1.92,[(0,.06),(.07,.20),(.12,.16)],"iron",6)
        cylinder(.81,0,2.04,[(0,.138),(.30,.173)],"lamplight",6)
        cylinder(.81,0,2.33,[(0,.21),(.045,.21),(.15,.10),(.18,.045)],"iron",6)
        for i in range(6):
            a=i*tau/6
            beam((.81+.14*cos(a),.14*sin(a),2.03),(.81+.18*cos(a),.18*sin(a),2.34),.022,mat="iron")
        kit.pointlight("Horn lantern",(.81,-.07,2.14),26)

    def dock():
        for x in (-.87,.87):
            beam((x,-1.97,.54),(x,1.97,.54),.16,.23)
            for y in (-1.56,1.56):
                beam((x,y,0),(x+.025,y,1.38+rng.uniform(-.07,.08)),.23,sides=8)
                for h in (1.09,1.13,1.17):
                    cylinder(x+.021,y,h,[(0,.132),(.029,.13)],"reed brass",9,.67)
        for i in range(17):
            y=-2+(i+.5)*4/17
            w=rng.uniform(1.98,2.09)
            # Beam UVs follow the long axis on each cross-board.
            beam((-w/2,y,.77),(w/2,y+rng.uniform(-.008,.008),.77),.12,.222,tint=rng.uniform(.6,1.04))
        # Low bollards and rope lashings keep the centre clear.

    def tower():
        cylinder(0,0,0,[(0,1.97),(.42,1.94),(.8,1.66),(5.92,1.34),(6.22,1.54)],"fieldstone",14)
        for z,r in [(.36,1.97),(3.18,1.54),(5.85,1.55),(6.21,1.84)]:
            cylinder(0,0,z,[(0,r-.075),(.09,r),(.19,r)],"quarry stone",14,.82)
        # Buttresses and crenellated corbels break up the tower silhouette.
        for i in range(12):
            a=i*tau/12
            beam((1.29*cos(a),1.29*sin(a),5.35),(1.69*cos(a),1.69*sin(a),6.27),.24,mat="quarry stone")
        for z,r in [(2.0,1.61),(4.15,1.48)]:
            for i in range(3):
                a=i*tau/3+z*.31
                beam((r*cos(a),r*sin(a),z),(r*cos(a),r*sin(a),z+.61),.12,mat="lamplight")
        cylinder(0,0,6.40,[(0,1.63),(.94,1.59)],"lamplight",10)
        for i in range(10):
            a=i*tau/10
            beam((1.66*cos(a),1.66*sin(a),6.27),(1.66*cos(a),1.66*sin(a),7.5),.18)
            b=a+tau/10
            beam((1.65*cos(a),1.65*sin(a),6.55),(1.65*cos(b),1.65*sin(b),6.55),.09)
        cylinder(0,0,7.38,[(0,1.84),(.16,2.12)],"hewn oak",12)
        for j in range(9):
            t=j/9
            r=2.2*(1-t)**1.38+.05
            upper=2.2*(1-(j+1)/9)**1.38+.05
            cylinder(0,0,7.49+j*.245,[(0,r),(.045,r),(.28,upper)],"slate",12,.75+.22*(j%3)/2)
        beam((0,0,9.69),(0,0,10.73),.061,mat="reed brass",sides=8)
        for i in range(7):
            a=i/7; b=(i+1)/7
            def flag(t,top):
                return (1.65*t,.20*sin(8*t),10.65-.23*t+.08*sin(7*t)-(0 if top else .51*(1-t)))
            kit.mesh.face([flag(a,False),flag(b,False),flag(b,True),flag(a,True)],"heath")

    def spruce():
        h=7.8
        cylinder(0,0,0,[(0,.246),(.56,.19),(3,.143),(6.2,.074),(h,.018)],"hewn oak",9,.65)
        for level in range(18):
            z=.62+level*.375
            radius=2.12*(1-level/19)**.82
            count=8 if level<12 else 6
            for i in range(count):
                a=(i+rng.uniform(-.2,.2))*tau/count+level*1.7
                r=radius*rng.uniform(.78,1.14)
                radial=Vector((cos(a),sin(a),0)); cross=Vector((-sin(a),cos(a),0))
                start=Vector((0,0,z+rng.uniform(.18,.53)))
                mid=start+radial*r*.61-Vector((0,0,r*.14))
                beam(start,mid,.032,mat="hewn oak",sides=4,tint=.64)
                # Individual secondary sprays fork off a sloping limb and hang
                # below it. Their irregular tips define the tree's silhouette.
                for fraction,side in [(.24,-1),(.29,1),(.49,-1),(.55,1),(.70,0)]:
                    base=start+radial*(fraction*r)-Vector((0,0,fraction*r*.20))
                    axis=(radial+cross*side*.83).normalized()
                    width=Vector((-axis.y,axis.x,0))*r*rng.uniform(.18,.27)
                    end=base+axis*r*rng.uniform(.39,.62)-Vector((0,0,r*rng.uniform(.24,.45)))
                    for sign in (-1,1):
                        edge=width*sign
                        kit.mesh.face([base,base+edge-Vector((0,0,.12)),end+edge*.56,end],
                                      "spruce needles",[(.5,0),(.5+.5*sign,0),(.5+.5*sign,1),(.5,1)],
                                      rng.uniform(.74,1.13))
        for level in range(4):
            for i in range(5):
                a=i*tau/5+level*1.4
                r=.31-level*.063
                base=Vector((0,0,7.14+level*.18))
                width=Vector((-sin(a),cos(a),0))*r*.65
                tip=base+Vector((r*cos(a),r*sin(a),-r*.57))
                kit.mesh.face([base-width,base+width,tip+width,tip-width],"spruce needles",
                              [(0,0),(1,0),(1,1),(0,1)])

    def boulder(x,y,w,d,h):
        n=10
        outline=[(cos(i*tau/n)*rng.uniform(.84,1.09),sin(i*tau/n)*rng.uniform(.84,1.09)) for i in range(n)]
        rings=[]
        for scale,z,shift in [(1,0,0),(.97,.30,.03),(.76,.72,.17),(.32,.95,.22)]:
            rings.append([(x+w*(a*scale+shift),y+d*b*scale,h*(z+rng.random()*.09 if z else 0)) for a,b in outline])
        kit.mesh.solid(rings,"quarry stone",rng.uniform(.61,.93))

    def crag():
        boulder(0,0,1.8,1.26,1.78)
        boulder(-1.36,-.48,1.03,.85,.99)
        boulder(1.48,-.39,.88,.80,.83)

    def barrel():
        for i in range(16):
            a,b=i*tau/16+.007,(i+1)*tau/16-.007
            rings=[]
            for z,r in [(0,.32),(.15,.36),(.49,.39),(.78,.36),(.93,.32)]:
                rings.append([(rr*cos(ang),rr*sin(ang),z) for rr,ang in [(r,a),(r,b),(r-.032,b),(r-.032,a)]])
            kit.mesh.solid(rings,"hewn oak",rng.uniform(.63,.98))
        for z,r in [(.1,.36),(.31,.389),(.67,.388),(.84,.35)]:
            cylinder(0,0,z,[(0,r),(.051,r)],"iron",16)
        cylinder(0,0,.89,[(0,.315),(.022,.313)],"hewn oak",16)

    def verge():
        for i in range(5):
            x,y=rng.uniform(-1,1),rng.uniform(-.63,.63)
            r=rng.uniform(.18,.64)
            boulder(x,y,r*.74,r*.62,r*.57)
        for i in range(32):
            x,y=rng.uniform(-1.16,1.16),rng.uniform(-.77,.77)
            for j in range(8):
                a=rng.uniform(0,tau); h=rng.uniform(.13,.47); dx=cos(a); dy=sin(a)
                base=Vector((x,y,0)); bend=Vector((dx*h*.28,dy*h*.28,h*.7))
                edge=Vector((-dy*.027,dx*.027,0))
                kit.mesh.face([base-edge,base+edge,base+bend+edge*.6,base+bend-edge*.6],"deep moss",tint=rng.uniform(.6,1.12))
                kit.mesh.face([base+bend-edge*.6,base+bend+edge*.6,base+Vector((dx*h*.8,dy*h*.8,h))],"deep moss")
            if i%5==0:
                h=rng.uniform(.36,.61)
                beam((x,y,0),(x+.04,y,h),.015,mat="deep moss")
                for j in range(5):
                    a=j*2.4
                    cylinder(x+.04+.03*cos(a),y+.03*sin(a),h-j*.035,
                             [(0,.024),(.033,.037),(.049,.018)],"heath",5)

    return {"well":well,"lantern":lantern,"dock":dock,"watchtower":tower,
            "spruce":spruce,"verge":verge,"crag":crag,"barrel":barrel}
