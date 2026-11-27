"""Bake original chased steel, hide, weld-worn trim and dyed wool into glTF PBR maps."""
import struct
import zlib
from pathlib import Path

import bpy
import numpy as np

HERE=Path(__file__).resolve().parent
TILES={
    "steel":((94,111,118),.79,.39),
    "steel_high":((119,132,132),.76,.40),
    "gunmetal":((65,75,79),.72,.49),
    "edge":((166,170,159),.81,.34),
    "latten":((158,123,65),.72,.44),
    "leather":((62,43,32),.01,.76),
    "oxblood":((108,43,38),.01,.87),
    "umber":((76,62,51),.0,.91),
    "wool":((59,63,64),.0,.91),
    "piping":((144,109,71),.03,.79),
    "mail":((69,76,74),.64,.52),
    "lining":((38,31,28),.0,.92),
}
T=224


def save_png(path,img):
    h,w=img.shape[:2]
    def chunk(k,d):
        return struct.pack(">I",len(d))+k+d+struct.pack(">I",zlib.crc32(k+d))
    lines=b"".join(b"\0"+r.tobytes() for r in img)
    path.write_bytes(b"\x89PNG\r\n\x1a\n"+chunk(b"IHDR",struct.pack(">IIBBBBB",w,h,8,2,0,0,0))
                     +chunk(b"IDAT",zlib.compress(lines,9))+chunk(b"IEND",b""))


def materials():
    rng=np.random.default_rng(109128)
    yy,xx=np.mgrid[:T,:T]
    colours=np.zeros((3*T,4*T,3),np.uint8)
    orm=np.zeros_like(colours)
    for i,(name,(colour,metal,rough)) in enumerate(TILES.items()):
        noise=rng.normal(0,1,(T,T))
        cloudy=np.sin(xx*.048+np.sin(yy*.053))+np.cos(yy*.063-xx*.041)+.58*np.cos(xx*.12-yy*.089)
        if name=="mail":
            # Interleaved links with dark hollows and rubbed top arcs.
            row=yy//9
            x=((xx+row*4)%11-5)/5
            y=(yy%9-4)/3.6
            d=np.sqrt(x*x+y*y)
            shade=-17+37*np.exp(-((d-.66)/.22)**2)*(1-.5*y)
        elif metal>.5:
            shade=3.4*cloudy+2.5*noise+1.8*np.sin(xx*1.23+np.sin(yy*.048))
            for _ in range(74):
                cx,cy=rng.uniform(0,T,2)
                angle=rng.uniform(-1.5,1.5)
                dx,dy=xx-cx,yy-cy
                along=dx*np.cos(angle)+dy*np.sin(angle)
                across=dy*np.cos(angle)-dx*np.sin(angle)
                shade+=rng.uniform(-23,18)*np.exp(-(across/.64)**2-(along/rng.uniform(2,12))**2)
        elif name=="leather":
            shade=3.8*cloudy+noise*3.6+1.9*np.sin(yy*.4+np.sin(xx*.09))
        else:
            direction=np.where((xx//14)%2,-1,1)
            shade=3*cloudy+3*noise+5*np.sin((xx+direction*yy)*1.57)+2*np.sin(yy*2.2)
            if name=="oxblood":
                shade+=5*np.cos(xx*.075)*np.cos(yy*.027)
        rs,cs=divmod(i,4)
        region=(slice(rs*T,(rs+1)*T),slice(cs*T,(cs+1)*T))
        colours[region]=np.clip(np.array(colour)+shade[:,:,None],0,255)
        orm[region]=np.stack([np.full((T,T),255),np.clip(255*rough-shade*.53,22,245),
                              np.full((T,T),round(255*metal))],-1).astype(np.uint8)
    mat=bpy.data.materials.new("Edric | oiled steel, madder wool and hide")
    mat.use_nodes=True
    tree=mat.node_tree
    shader=tree.nodes.get("Principled BSDF")
    for name,img in [("keeper-basecolour",colours),("keeper-roughness-metal",orm)]:
        path=HERE/(name+".png")
        save_png(path,img)
        image=bpy.data.images.load(str(path))
        tex=tree.nodes.new("ShaderNodeTexImage")
        tex.image=image
        if name.endswith("metal"):
            image.colorspace_settings.name="Non-Color"
            split=tree.nodes.new("ShaderNodeSeparateColor")
            tree.links.new(tex.outputs["Color"],split.inputs["Color"])
            tree.links.new(split.outputs["Green"],shader.inputs["Roughness"])
            tree.links.new(split.outputs["Blue"],shader.inputs["Metallic"])
        else:
            tree.links.new(tex.outputs["Color"],shader.inputs["Base Color"])
        image.pack()
    return mat
