"""Bake sun, stubble and age into the existing head UVs in model coordinates."""
import bpy
import numpy as np


def weather_face(body):
    material=next(m for m in body.data.materials if m.name.startswith("MI_Superhero"))
    node=next(n for n in material.node_tree.nodes if n.type=="TEX_IMAGE" and "Dark" in n.image.name)
    base=node.image
    # The original map shares a compact head island with the whole body.
    # Make an editable packed copy, keeping the inherited UVs and normal map.
    size=1024
    base.scale(size,size)
    pixels=np.empty(size*size*4,dtype=np.float32)
    base.pixels.foreach_get(pixels)
    rgba=pixels.reshape(size,size,4)
    source=rgba.copy()
    mesh=body.data
    mesh.calc_loop_triangles()
    uv=mesh.uv_layers.active.data
    rng=np.random.default_rng(1948)
    fleck=rng.normal(0,1,(size,size))
    for tri in mesh.loop_triangles:
        coords=np.array([tuple(body.matrix_world@mesh.vertices[v].co) for v in tri.vertices])
        if coords[:,2].max()<1.55 or max(abs(coords[:,0]))>.14:
            continue
        tex=np.array([tuple(uv[i].uv) for i in tri.loops])*size-.5
        minx,miny=np.maximum(np.floor(tex.min(axis=0)),0).astype(int)
        maxx,maxy=np.minimum(np.ceil(tex.max(axis=0)),size-1).astype(int)
        if minx>maxx or miny>maxy:
            continue
        ys,xs=np.mgrid[miny:maxy+1,minx:maxx+1]
        e=tex[1:]-tex[0]
        if abs(np.linalg.det(e))<1e-7:
            continue
        a,b=(np.stack([xs-tex[0,0],ys-tex[0,1]],-1)@np.linalg.inv(e)).transpose(2,0,1)
        inside=(a>=-1e-5)&(b>=-1e-5)&(a+b<=1.00001)
        p=coords[0]+a[:,:,None]*(coords[1]-coords[0])+b[:,:,None]*(coords[2]-coords[0])
        x,y,z=p.transpose(2,0,1)
        x=np.abs(x)
        def g(dx,dz,sx,sz):
            return np.exp(-((x-dx)/sx)**2-((z-dz)/sz)**2)
        def seam(height,width,lo,hi):
            return np.exp(-((z-height)/width)**2)*np.clip((x-lo)/.006,0,1)*np.clip((hi-x)/.006,0,1)
        # Temple creases, folds from the nostrils, and bags beneath the eyes.
        front=np.clip((.022-y)/.05,0,1)
        lines=(seam(1.699-.20*(x-.034),.0028,.014,.064)*.16
               +seam(1.696-.30*(x-.053),.0018,.047,.077)*.22
               +seam(1.704+.26*(x-.053),.0015,.048,.077)*.20
               +seam(1.661-.86*(x-.019),.0025,.018,.047)*.23
               +seam(1.741+.003*np.cos(x*59),.0025,.0,.065)*.10)
        cheek=(g(.052,1.676,.038,.022)+.7*g(.007,1.664,.017,.011))*front
        stubble=np.clip((1.630+.062*np.clip((x-.021)/.062,0,1)-z)/.013,0,1)*front
        stubble*=np.clip((z-1.568)/.022,0,1)
        eye=g(.035,1.701,.029,.008)*front
        grain=fleck[ys,xs]
        pigment=np.stack([1.01+.082*cheek, .94-.10*cheek, .87-.09*cheek],axis=-1)
        shade=(1-front*lines-.17*stubble-.12*eye+.016*grain-.13*stubble*np.maximum(0,grain))[:,:,None]
        col=source[ys,xs,:3]*pigment*shade
        target=rgba[miny:maxy+1,minx:maxx+1,:3]
        target[inside]=np.clip(col[inside],0,1)
    result=bpy.data.images.new("Oswin | windburn and stubble",width=size,height=size)
    result.pixels.foreach_set(rgba.ravel())
    result.pack()
    node.image=result
