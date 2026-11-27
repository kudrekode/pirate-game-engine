"""The tide lantern shares the well's aged copper, adzed oak and bank stone."""
from math import cos, pi, sin, tau
import bpy
from mathutils import Vector as V


def lantern(w):
    lathe,tube,timber = w.lathe,w.tube,w.timber
    # A shouldered quarry-stone socket, with iron shoes protecting the post.
    lathe(0,0,[(0,.244),(.047,.263),(.075,.257),(.09,.218),
               (.318,.198),(.373,.202),(.399,.188),(.427,.145)],"stone",8,offset=pi/8)
    timber((0,0,.36),(-.027,.01,2.79),(.177,.188))
    for z in (.45,.59,2.34,2.58,2.73):
        dx = -.027*z/2.79
        timber((dx,.01,z),(dx,.01,z+.032),(.19,.204),"iron")
    for face in (-1,1):
        y = face*.096+.01
        w.panel([(-.077,y,.45),(.076,y,.45),(.074,y,.795),(.037,y,.833),
                 (.001,y,.915),(-.037,y,.833),(-.076,y,.795)],(0,face*.013,0),"iron")
        for z in (.53,.74,.837):
            tube([(0,y,z),(0,y+face*.021,z)],.016,"brass",8)
    lathe(-.027,.01,[(2.746,.122),(2.78,.125),(2.795,.116),(2.837,.107),
                      (2.903,.069),(2.928,.038)],"copper",8,offset=pi/8)
    lathe(-.027,.01,[(2.915,.031),(2.945,.04),(2.977,.032),(3.05,.004)],"brass",8)
    w.finish("01 • shod oak standard and octagonal stone socket")
    # A forged gooseneck and a riveted scroll share a diagonal thrust line.
    main = w.cubic((-.034,0,2.50),(.24,0,2.57),(.47,0,2.845),(.738,0,2.862))
    main += w.cubic(main[-1],(.99,0,2.91),(1.10,0,2.684),(.895,0,2.70))[1:]
    tube(main,[.038-i*.020/(len(main)-1) for i in range(len(main))],"iron",9)
    support = w.cubic((.055,0,2.12),(.219,0,2.167),(.30,0,2.57),(.557,0,2.752))
    tube(support,[.034-i*.012/(len(support)-1) for i in range(len(support))],"iron",8)
    scroll = w.cubic((.31,0,2.446),(.396,0,2.517),(.596,0,2.576),(.579,0,2.423))
    scroll += w.cubic(scroll[-1],(.565,0,2.326),(.463,0,2.355),(.497,0,2.417))[1:]
    tube(scroll,[.025-i*.015/(len(scroll)-1) for i in range(len(scroll))],"iron",8)
    for x,z in [(.054,2.13),(.052,2.532),(.324,2.45),(.536,2.754)]:
        tube([(x,-.045,z),(x,.045,z)],.021,"brass",10)
    lx = .822
    def ring(x,y,z,rx,rz,plane="xz",r=.011):
        pts = [(x+rx*cos(i*tau/20), y, z+rz*sin(i*tau/20)) if plane=="xz"
               else (x,y+rx*cos(i*tau/20),z+rz*sin(i*tau/20)) for i in range(21)]
        tube(pts,r,"iron",7)
    ring(lx,0,2.811,.028,.048)
    ring(lx,0,2.742,.022,.046,"yz")
    ring(lx,0,2.669,.032,.051)
    w.finish("02 • hanging chain and riveted double scroll")
    def spin(levels, style, shade=1):
        lathe(lx,0,levels,style,8,shade,pi/8)
    spin([(1.868,.019),(1.905,.041),(1.929,.032),(1.984,.12),(2.019,.177),
          (2.036,.181),(2.047,.153)],"copper")
    spin([(2.036,.153),(2.063,.149)],"brass")
    spin([(2.408,.185),(2.431,.202),(2.444,.224),(2.459,.224),
          (2.478,.191),(2.49,.183),(2.565,.115),(2.591,.069)],"copper")
    spin([(2.568,.089),(2.583,.09),(2.593,.070)],"brass")
    spin([(2.587,.071),(2.597,.071)],"copper")
    spin([(2.597,.042),(2.638,.043)],"iron",.34)
    spin([(2.634,.071),(2.649,.082),(2.658,.078),
          (2.686,.038),(2.698,.022)],"copper")
    for i in range(8):
        a = (i+.5)*tau/8
        p = (.150*cos(a),.150*sin(a))
        q = (.188*cos(a),.188*sin(a))
        tube([(lx+p[0],p[1],2.042),(lx+q[0],q[1],2.426)],.012,"iron",7)
        # An individual real slit between each pair of crown posts.
        tube([(lx+.063*cos(a),.063*sin(a),2.587),(lx+.063*cos(a),.063*sin(a),2.646)],
             .009,"iron",6)
    w.finish("03 • spun copper storm hood and pierced crown")
    shader = w.kit.MATERIALS[w.GLASS].node_tree
    bs = shader.nodes.get("Principled BSDF")
    horn = shader.nodes.new("ShaderNodeTexImage")
    horn.image = bpy.data.images.load(str(w.HERE/"maps/horn.jpg"))
    shader.links.new(horn.outputs["Color"],bs.inputs["Base Color"])
    shader.links.new(horn.outputs["Color"],bs.inputs["Emission Color"])
    bs.inputs["Emission Strength"].default_value = 1.35
    bs.inputs["Roughness"].default_value = .36
    for i in range(8):
        a,b = (i+.5)*tau/8,(i+1.5)*tau/8
        corners = [V((lx+r*cos(t),r*sin(t),z)) for t,r,z in
                   [(a,.15,2.051),(b,.15,2.051),(b,.187,2.416),(a,.187,2.416)]]
        w.part.face(corners,w.GLASS,[(0,0),(1,0),(1,1),(0,1)])
        normal = V((cos((a+b)/2),sin((a+b)/2),0))
        def pane(u,v):
            return corners[0].lerp(corners[1],u).lerp(corners[3].lerp(corners[2],u),v)+normal*.003
        for sign in (-1,1):
            arch = [pane(.5+sign*.49,.60),pane(.5+sign*.43,.70),pane(.5+sign*.25,.79),pane(.5,.91)]
            tube(arch,.0058,"brass",6)
        tube([pane(.02,.28),pane(.5,.15),pane(.98,.28)],.005,"iron",6)
    w.finish("04 • eight graduated horn panes and arched brass cames")
    w.kit.pointlight("Tide lantern | warm wick",(.81,-.07,2.14),26)
