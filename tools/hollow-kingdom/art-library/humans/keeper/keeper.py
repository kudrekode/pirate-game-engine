"""Edric's sallet and late-medieval field harness on Bell Court's original combat rig."""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

HERE=Path(__file__).resolve().parent
sys.dont_write_bytecode=True
sys.path[:0]=[str(HERE),str(HERE.parent)]
from finish import TILES, materials
from oswin import Garment, hoop, limbs, mix, torso
from plates import AFTER, BEFORE, load_actor
from textiles import uv

TAU=math.tau
sin,cos=math.sin,math.cos


class Pattern(Garment):
    aliases={"coat":"oxblood","welt":"leather","binding":"piping","trouser":"wool","metal":"latten"}

    def panel(self,rows,dye,closed=True,reverse=False):
        start=len(self.uvs)
        super().panel(rows,"welt",closed,reverse)
        tile=list(TILES).index(self.aliases.get(dye,dye))
        u0,v0=uv("welt",0,0)
        for j in range(start,len(self.uvs)):
            self.uvs[j]=[(u-u0+(tile%4+.032)/4,v-v0+(2-tile//4+.032)/3) for u,v in self.uvs[j]]

    def stud(self,point,radius,depth,bone,dye="latten",direction=(0,-1,0)):
        n=Vector(direction).normalized()
        u=n.cross(Vector((0,0,1)) if abs(n.z)<.9 else Vector((1,0,0))).normalized()
        v=n.cross(u)
        profile=[(0,.80),(.27,1),(.76,.73),(1,.09)]
        rows=[]
        for h,r in profile:
            rows.append([(Vector(point)+n*(depth*h)+radius*r*(u*cos(TAU*i/10)+v*sin(TAU*i/10)),bone)
                         for i in range(10)])
        self.panel(rows,dye)


def helmet(g):
    bone="Head"
    def shell(z,rx,ry,cy,tail,count=76,nose=0,crest=0):
        row=[]
        for i in range(count):
            a=TAU*i/count
            s,c=sin(a),cos(a)
            back=max(0,-c)**1.85
            projection=max(0,c)**8
            # Drawn nape with a narrowed centre ridge and a shallow keel.
            point=(rx*s*(1-.20*back),cy-ry*c+back*tail*.44-nose*projection,
                   z-tail*back+crest*(abs(c)**14))
            row.append((point,bone))
        return row
    # Lower bevor wraps underneath the cheek bones, with an inward returned edge.
    bevor=[]
    for z,rx,ry,cy in [(1.554,.074,.082,.017),(1.570,.089,.103,.016),
                        (1.605,.105,.121,.013),(1.638,.111,.129,.008),(1.675,.107,.119,.012),
                        (1.692,.099,.112,.012)]:
        row=shell(z,rx,ry,cy,.007,nose=.014*max(0,(z-1.58)/.12))
        beveled=[]
        for k,((x,y,h),w) in enumerate(row):
            a=TAU*k/len(row)
            h-=max(0,(z-1.60)/.10)*.048*max(0,-cos(a))
            h+=max(0,(z-1.62)/.075)*.020*abs(sin(a))**2
            beveled.append(((x,y,h),w))
        bevor.append(beveled)
    g.panel(bevor,"gunmetal")
    # Bell-shaped sallet bowl. The raised front lip leaves one continuous dark ocular slit.
    bowl=[]
    for z,rx,ry,cy,tail,crest in [(1.712,.111,.119,.014,.104,.001),(1.720,.112,.121,.013,.099,.002),
                                   (1.747,.111,.116,.015,.063,.004),(1.776,.110,.113,.015,.033,.006),
                                   (1.806,.100,.109,.018,.014,.009),(1.831,.078,.091,.020,.007,.012),
                                   (1.847,.046,.073,.023,.002,.014),(1.857,.013,.048,.025,0,.008),
                                   (1.859,.002,.010,.022,0,.002)]:
        bowl.append(shell(z,rx,ry,cy,tail,crest=crest))
    g.panel(bowl,"steel")
    g.panel(bowl[:2],"edge")
    # An independently rolled visor sweeps from one temple to the other.
    visor=[]
    for j in range(6):
        r=[]
        for k in range(49):
            a=mix(-1.43,1.43,k/48)
            s,c=sin(a),cos(a)
            bulge=1-abs(s)**1.8
            y=.013-(.122+(.009 if j in (1,2) else 0))*c
            y-=bulge*[.021,.025,.021,.015,.003,0][j]
            z=[1.713,1.717,1.724,1.738,1.749,1.754][j]-.016*(1-bulge)+.004*bulge
            r.append(((.115*s,y,z),bone))
        visor.append(r)
    g.panel(visor,"steel_high",False)
    g.panel(visor[:2],"edge",False)
    for side in [-1,1]:
        g.stud((side*.113,-.019,1.727),.012,.005,bone,"gunmetal",(side,0,0))
        g.stud((side*.118,-.019,1.727),.0065,.003,bone,"latten",(side,0,0))
        # Small drawn louvers in the fixed lower guard, arranged in threes.
        for row in range(2):
            for j in range(3):
                a=side*(.27+.142*j)
                pos=Vector((.111*sin(a),.008-.126*cos(a)-.006*cos(a)**8,1.649+.011*row+.002*j))
                vec=Vector((cos(a),sin(a),.28)).normalized()*.004
                g.tube([pos-vec,pos+vec],.0019,bone,"lining",6)
    # Lapped gorget, widening over the collarbones.
    for z,rx,ry,b,depth in [(1.452,.202,.126,"spine_03",.037),(1.493,.158,.117,"spine_03",.037),
                            (1.521,.125,.111,"spine_03",.031),(1.547,.108,.101,"neck_01",.030)]:
        rings=[hoop(z,rx,ry,.028,bone=b),hoop(z+.004,rx+.002,ry+.002,.028,bone=b),
               hoop(z+depth,rx*.84,ry*.89,.028,bone=b)]
        g.panel(rings,"gunmetal")
        g.panel(rings[:2],"edge")


def breast(g):
    profile=[(1.023,.177,.144),(1.049,.175,.146),(1.09,.173,.144),(1.126,.179,.15),
             (1.182,.192,.169),(1.248,.215,.179),(1.320,.233,.182),(1.39,.239,.17),
             (1.439,.229,.150),(1.471,.202,.132),(1.502,.147,.107)]
    def point(a,z,rx,ry):
        s,c=sin(a),cos(a)
        front=max(0,c)
        t=max(0,min(1,(z-1.035)/.451))
        # Six gathering flutes emerge from the narrow waist into the high breast.
        ridge=.014*(front**1.8)*sin(math.pi*t)**.75*max(0,cos(a*(13-4*t)))**3
        keel=.013*front**24*(.3+.7*sin(math.pi*t))
        h=z+.010*t*abs(c)**6
        return Vector(((rx+ridge)*s,.033-(ry+ridge)*c-keel,h))
    rows=[]
    for z,rx,ry in profile:
        rows.append([(point(TAU*i/92,z,rx,ry),torso(z)) for i in range(92)])
    g.panel(rows,"steel")
    # Rivets and chased edge on the breast, with a raised central medial ridge.
    g.tube([row[0][0]+Vector((0,-.001,0)) for row in rows[2:-1]],.0017,
           [torso(p[0][0].z) for p in rows[2:-1]],"edge",6)
    for s in [-1,1]:
        for z,rx,ry in profile[2:10:2]:
            a=s*1.06
            p=point(a,z,rx,ry)
            g.stud(p,.0042,.0027,torso(z),"latten",(sin(a),-cos(a),.12))
    # A livery panel follows the measured breast at every point. Its cast bell is
    # stitched into the madder wool; the panel and chains carry the court colours.
    def chest(x,z,offset):
        lo,hi=profile[0],profile[-1]
        for r,next_r in zip(profile,profile[1:]):
            if r[0]<=z<=next_r[0]:
                lo,hi=r,next_r
                break
        t=max(0,min(1,(z-lo[0])/(hi[0]-lo[0])))
        rx,ry=mix(lo[1],hi[1],t),mix(lo[2],hi[2],t)
        a=math.asin(max(-.98,min(.98,x/rx)))
        co=point(a,z,rx,ry)
        return co+Vector((sin(a)*offset,-cos(a)*offset,0)),torso(z)
    patch=[]
    for j in range(17):
        t=j/16
        row=[]
        for k in range(10):
            u=k/9
            x=mix(.055,.145,u)+.014*t
            z=mix(1.265+.031*abs(2*u-1),1.442,t)
            row.append(chest(x,z,.008))
        patch.append(row)
    g.panel(patch,"oxblood",False)
    for col in [0,-1]:
        g.tube([r[col][0] for r in patch],.0024,[r[col][1] for r in patch],"piping",6)
    g.tube([p for p,_ in patch[0]],.0024,[w for _,w in patch[0]],"piping",6)
    def applique(rows):
        g.panel([[chest(x,z,.0118) for x in row] for z,row in rows],"latten",False)
    applique([(1.324,[.080,.143]),(1.330,[.080,.143]),(1.338,[.089,.136]),
              (1.362,[.095,.130]),(1.378,[.102,.124]),(1.384,[.109,.118])])
    applique([(1.306,[.109,.116]),(1.312,[.107,.119]),(1.319,[.109,.117])])
    for x in [.075,.140]:
        p,w=chest(x,1.423,.013)
        g.stud(p,.004,.0025,w,"latten",(0,-1,0))
    # Lower fauld lames overlap downward with rolled lips and a medial point.
    for idx,(z,rx,ry) in enumerate([(1.04,.185,.152),(1.009,.194,.158),(.978,.204,.167)]):
        rings=[]
        for dz,q in [(0,1.035),(.004,1.036),(.026,1.012),(.047,.965)]:
            row=[]
            for k in range(68):
                a=TAU*k/68
                h=z+dz-.017*max(0,cos(a))**4
                row.append(((rx*q*sin(a),.035-ry*q*cos(a),h),"pelvis"))
            rings.append(row)
        g.panel(rings,"gunmetal" if idx==1 else "steel")
        g.panel(rings[:2],"edge")
    # Madder wool arming skirt with split vents. Tassets ride on the two thighs.
    for s,suffix in [(1,"l"),(-1,"r")]:
        rings=[]
        for z,rx,ry in [(.724,.248,.19),(.74,.247,.188),(.852,.219,.173),(.95,.199,.16),(1.008,.184,.155)]:
            row=[]
            for k in range(42):
                a=s*mix(.052,math.pi-.043,k/41)
                fold=1+.035*cos(10*a+z*5)
                h=z-.023*cos(a*3)*(1.03-z)
                t=max(0,min(.82,(1-z)/.33))
                row.append(((rx*sin(a)*fold,.032-ry*cos(a)*fold,h),{"pelvis":1-t,"thigh_"+suffix:t}))
            rings.append(row)
        g.panel(rings,"oxblood",False,s<0)
        g.panel(rings[:2],"piping",False,s<0)
        # Overlapping fluted plates hang independently from two leather points.
        for plate in range(3):
            top=.994-.049*plate
            rings=[]
            for within in [0,.08,.6,1]:
                row=[]
                for k in range(28):
                    u=k/27
                    a=s*mix(.16,1.47,u)
                    t=(plate+(1-within))*.31
                    h=top-.077*(1-within)-.023*sin(math.pi*u)
                    r=.008*cos(u*math.pi*6)**4
                    x=(.207+.022*t+r)*sin(a)
                    y=.024-(.176+.018*t+r)*cos(a)
                    w=min(.76,(1.01-h)*3.2)
                    row.append(((x,y,h),{"pelvis":1-w,"thigh_"+suffix:w}))
                rings.append(row)
            g.panel(rings,"steel_high" if plate==0 else "steel",False,s<0)
            g.panel(rings[:2],"edge",False,s<0)
            for k in [3,24]:
                p,w=rings[-2][k]
                a=s*mix(.16,1.47,k/27)
                g.stud(p,.0047,.003,w,"latten",(sin(a),-cos(a),0))


def arms(g):
    # Elliptical sections along the arm. Their exposed edges roll inward.
    for side,suffix in [(1,"l"),(-1,"r")]:
        upper,lower,hand=[k+"_"+suffix for k in ("upperarm","lowerarm","hand")]
        def band_x(x,ry,rz,bone,start=-.65,end=math.pi+.72,count=38):
            row=[]
            for j in range(count):
                a=mix(start,end,j/(count-1))
                row.append(((x*side,.063+ry*cos(a),1.464+rz*sin(a)),bone))
            return row
        # The left shoulder carries a higher fence and a third articulated lame.
        span=1.10 if side>0 else 1
        for start,base,lift,depth in [(.316,.080,.079,.058),(.280,.094,.103,.067),(.210,.119,.118,.103)]:
            rings=[]
            for t,r in [(0,.71),(.13,.87),(.44,1),(.72,.99),(.93,.91),(1,.90)]:
                x=start+depth*t
                row=band_x(x,base*r*span,lift*r*span,upper,-.69,math.pi+.69)
                for j,(p,w) in enumerate(row):
                    a=mix(-.69,math.pi+.69,j/(len(row)-1))
                    ridge=.005*(max(0,cos(6*a))**5)*sin(math.pi*t)
                    row[j]=((p[0],p[1]+ridge*cos(a),p[2]+ridge*sin(a)),w)
                rings.append(row)
            g.panel(rings,"steel",False,side<0)
            g.panel(rings[-2:],"edge",False,side<0)
            for idx in [2,-3]:
                p,_=rings[2][idx]
                normal=(0,1 if idx>0 else -1,-.15)
                g.stud(p,.0051,.0035,upper,"latten",normal)
        for x,ry,rz in [(.175,.089,.08),(.20,.109,.105)]:
            g.panel([band_x(x,ry,rz,upper,-.4,math.pi+.4),band_x(x+.025,ry*1.09,rz*1.11,upper,-.4,math.pi+.4)],
                    "mail",False,side<0)
        # Rerebrace and fitted elbow cup, avoiding an arm-width cylinder.
        fore=[band_x(x,r,z,upper,-1.0,math.pi+1.0) for x,r,z in [(.356,.079,.072),(.387,.075,.07),(.422,.068,.064)]]
        g.panel(fore,"gunmetal",False,side<0)
        elbow=[band_x(x,r,r*.96,lower,-.85,math.pi+.85) for x,r in [(.426,.066),(.449,.078),(.469,.078),(.489,.061)]]
        g.panel(elbow,"steel_high",False,side<0)
        # Vambrace has a flattened inside seam and a wrist flare.
        rows=[]
        for x,ry,rz in [(.485,.064,.065),(.491,.067,.068),(.508,.070,.067),(.571,.063,.059),
                        (.636,.050,.052),(.675,.044,.045),(.695,.049,.051)]:
            rows.append(band_x(x,ry,rz,lower,-1.36,math.pi+1.41))
        g.panel(rows,"steel",False,side<0)
        g.panel(rows[:2],"edge",False,side<0)
        for x,r in [(.52,.068),(.642,.054)]:
            verts=band_x(x,r,r*.96,lower,0,TAU,37)
            end=band_x(x+.010,r,r*.96,lower,0,TAU,37)
            g.panel([verts,end],"leather",False,side<0)
        # Articulated dorsal lames stop at the finger joints so a closed grip can curl.
        rows=[band_x(x,ry,rz,hand,.31,math.pi-.31,27) for x,ry,rz in
              [(.700,.043,.042),(.719,.047,.040),(.744,.054,.039),(.766,.055,.035),(.789,.052,.031)]]
        g.panel(rows,"gunmetal",False,side<0)
        for x,r in [(.746,.052),(.770,.053),(.789,.05)]:
            g.panel([band_x(x,r,.038,hand,.30,math.pi-.3,27),
                     band_x(x+.006,r,.037,hand,.30,math.pi-.3,27)],"steel_high",False,side<0)


def legs(g):
    for side,suffix in [(1,"l"),(-1,"r")]:
        calf="calf_"+suffix
        thigh="thigh_"+suffix
        def greave(z,rx,ry,cy,bone,breadth=1.70,apex=0):
            row=[]
            for j in range(39):
                a=mix(-breadth,breadth,j/38)
                ridge=.008*max(0,cos(a))**16
                h=z+apex*max(0,cos(a))**4
                row.append(((side*.114+(rx+ridge)*sin(a),cy-(ry+ridge)*cos(a),h),bone))
            return row
        # The knee points grow from the same asymmetric cut as the shin.
        shin=[greave(z,rx,ry,cy,calf,span,tip) for z,rx,ry,cy,span,tip in
              [(.145,.060,.072,.065,1.46,-.018),(.153,.060,.074,.065,1.48,-.017),
               (.211,.059,.085,.066,1.50,0),(.292,.067,.090,.061,1.58,0),
               (.363,.077,.096,.060,1.66,0),(.430,.085,.101,.057,1.72,0),
               (.476,.083,.096,.048,1.63,.012),(.482,.082,.095,.048,1.59,.012)]]
        g.panel(shin,"steel",False)
        g.panel(shin[:2],"edge",False)
        g.panel(shin[-2:],"edge",False)
        # Rolled vertical edges secure the open greave to the dark boot.
        for idx in [0,-1]:
            g.tube([r[idx][0] for r in shin],.0022,calf,"gunmetal")
        knee=[greave(z,rx,ry,cy,calf,1.61,tip) for z,rx,ry,cy,tip in
              [(.474,.085,.091,.05,.005),(.49,.089,.097,.047,.024),(.526,.088,.101,.043,.006),
               (.549,.087,.094,.041,.010),(.563,.080,.087,.045,.001)]]
        g.panel(knee,"steel_high",False)
        # Pivot head and fan. Curved surfaces stay close to the outer knee.
        for z,r in [(.52,.026),(.523,.014)]:
            g.stud((side*.197,.049,z),r,.012,calf,"gunmetal" if r>.02 else "latten",(side,0,0))
        upper=[greave(z,rx,ry,cy,thigh,1.53,tip) for z,rx,ry,cy,tip in
               [(.565,.079,.09,.046,.004),(.571,.082,.094,.047,.005),(.632,.092,.105,.047,.012),
                (.719,.106,.111,.05,.008),(.767,.106,.105,.053,.003)]]
        g.panel(upper,"gunmetal",False)
        g.panel(upper[:2],"edge",False)


def lining(g):
    # Soft backing at the scyes and behind the lapped gorget.
    rings=[hoop(z,rx*.87,ry*.86,.033,warp=.007,bone=torso(z)) for z,rx,ry in
           [(.997,.174,.139),(1.16,.182,.149),(1.32,.213,.148),(1.407,.227,.141),
            (1.475,.205,.129),(1.515,.132,.103),(1.544,.097,.086),(1.575,.083,.079)]]
    g.panel(rings,"mail")
    start=len(g.points)
    limbs(g)
    # The plated silhouette replaces the hidden full-width doublet and trouser
    # allowance. Pull their backing inside the harness at all animated joints.
    for i in range(start,len(g.points)):
        p=g.arm.matrix_world@g.points[i]
        if p.z>1.34 and abs(p.x)>.15:
            k=.74 if abs(p.x)<.33 else .84
            p.y=mix(.064,p.y,k)
            p.z=mix(1.465,p.z,k)
        elif .56<p.z<.83:
            centre=.106 if p.x>0 else -.106
            p.x=mix(centre,p.x,.83)
            p.y=mix(.05,p.y,.80)
        elif .18<p.z<.465:
            centre=.114 if p.x>0 else -.114
            p.x=mix(centre,p.x,.89)
            p.y=mix(.062,p.y,.88)
        g.points[i]=g.arm.matrix_world.inverted()@p


def trim_base(arm):
    for o in list(arm.children_recursive):
        if o.name.startswith(("Tailored outerwear","Riveted harness","V2_Buzzed")):
            bpy.data.objects.remove(o,do_unlink=True)
    obj=next(o for o in arm.children_recursive if o.name.startswith("SuperHero"))
    hide=bpy.data.materials.new("Edric | lanolin glove leather")
    hide.use_nodes=True
    shader=hide.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value=(.066,.041,.028,1)
    shader.inputs["Roughness"].default_value=.71
    obj.data.materials.append(hide)
    leather_index=len(obj.data.materials)-1
    mesh=bmesh.new()
    mesh.from_mesh(obj.data)
    drop=[]
    for face in mesh.faces:
        p=obj.matrix_world@face.calc_center_median()
        if abs(p.x)>.694 and p.z>1.30:
            face.material_index=leather_index
        elif p.z<1.583 or p.z>1.787 or abs(p.x)>.103:
            drop.append(face)
    bmesh.ops.delete(mesh,geom=drop,context="FACES")
    mesh.to_mesh(obj.data)
    mesh.free()


def export_source():
    bpy.ops.wm.open_mainfile(filepath=str(HERE/"keeper.blend"))
    arm=next(o for o in bpy.context.scene.objects if o.type=="ARMATURE")
    pieces=[o for o in arm.children_recursive if o.get("keeper_pattern")]
    assert len(pieces)==5
    bpy.ops.object.select_all(action="DESELECT")
    for o in pieces:
        o.select_set(True)
    bpy.context.view_layer.objects.active=pieces[0]
    bpy.ops.object.join()
    bpy.context.object.name="Bell Court field harness"
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [arm.parent,arm,*arm.children_recursive]:
        if obj:
            obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(AFTER),use_selection=True,export_format="GLB",export_animations=False,
                              export_all_vertex_colors=False,export_yup=True)


def build():
    arm=load_actor(BEFORE)
    trim_base(arm)
    atlas=materials()
    for label,fn in [("Madder arming clothes",lining),("Articulated arm harness",arms),
                     ("Fluted plackart and tassets",breast),("Articulated poleyns and greaves",legs),
                     ("Sallet, bevor and lapped gorget",helmet)]:
        mesh=Pattern(arm,(atlas,))
        fn(mesh)
        obj=mesh.finish(label)
        del obj["oswin_pattern_piece"]
        obj["keeper_pattern"]=True
    bpy.ops.object.select_all(action="DESELECT")
    arm.select_set(True)
    bpy.context.view_layer.objects.active=arm
    for screen in bpy.data.screens:
        for area in screen.areas:
            if area.type=="VIEW_3D":
                space=area.spaces.active
                space.region_3d.view_distance=2.8
                space.region_3d.view_location=(0,0,1.06)
                space.region_3d.view_rotation=Vector((-.3,-1,.12)).to_track_quat("Z","Y")
                space.shading.color_type="TEXTURE"
                space.overlay.show_overlays=False
    bpy.context.preferences.filepaths.save_version=0
    bpy.data.orphans_purge(do_recursive=True)
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(HERE/"keeper.blend"),compress=True)
    export_source()


if __name__=="__main__":
    if "--export-only" in sys.argv:
        export_source()
    else:
        build()
