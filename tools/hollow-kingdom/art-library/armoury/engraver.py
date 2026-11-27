"""Paint the metal, stamped ferry badge and grip surfaces for the game model."""
from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent / "maps"
N = 512


def noise(rng,w,h):
    patch = Image.fromarray(rng.normal(126,40,(h,w)).clip(0,255).astype("uint8"))
    return (np.asarray(patch.resize((N,N),Image.Resampling.BICUBIC)).astype(float)-126)/40


def stamp():
    im = Image.new("L",(N,N),0)
    p = ImageDraw.Draw(im)
    # A narrow river current followed by a ferry mark. The upper third is plain steel.
    for side in (-1,1):
        pts = []
        for i in range(84,479):
            t=(i-84)/395
            width=(1-t)**.45*(11+6*math.cos(t*math.pi*12))
            pts.append((round(256+side*width),i))
        p.line(pts,fill=155,width=2)
        for cy in (133,166,199,232,265,298):
            p.arc((256+side*4-11,cy-8,256+side*4+11,cy+8),25 if side==1 else 155,
                  185 if side==1 else 330,fill=116,width=2)
    p.polygon([(256,70),(243,46),(250,25),(256,18),(262,25),(269,46)],outline=225,width=3)
    p.line([(249,47),(256,54),(265,45)],fill=230,width=2)
    p.line([(256,54),(256,30)],fill=190,width=2)
    return np.flipud(np.asarray(im).astype(float)/255)


def make(i,name):
    rng=np.random.default_rng(861+i)
    y,x=np.mgrid[0:N,0:N]
    slow,mid,fast = noise(rng,7,7),noise(rng,37,45),rng.normal(0,1,(N,N))
    relief = mid*.7+fast*.28
    if name=="steel":
        polish=noise(rng,240,8)*2.7
        colour=np.array([138,149,150])+np.expand_dims(5*slow+mid*2.8+polish+fast*1.7,2)
        etch=stamp()
        colour += etch[:,:,None]*[-48,-46,-39]
        relief-=etch*5
        metal,rough=.79,.38+slow*.05+etch*.20
    elif name=="latten":
        dark=np.clip(.19+slow*.25+mid*.15,0,.93)
        colour=np.array([155,122,76])+dark[:,:,None]*[-65,-38,-22]+(mid*4+fast*1.8)[:,:,None]
        metal,rough=.72-dark*.26,.34+dark*.38
    elif name=="iron":
        rust=np.maximum(slow*.3+mid*.15,0)
        colour=np.array([76,77,74])+rust[:,:,None]*[32,8,-12]+(slow*4+mid*3+fast*2)[:,:,None]
        metal,rough=.55,.52+mid*.04
    else:
        pores=np.maximum(noise(rng,117,195)-.4,0)
        colour=np.array([58,45,36])+(slow*7+mid*5-pores*8+fast*2)[:,:,None]
        colour+=np.clip(noise(rng,15,48)-.6,0,1)[:,:,None]*[20,13,7]
        relief-=pores*3
        metal,rough=0,.74+mid*.04
    dy,dx=np.gradient(relief)
    normal=np.stack((-dx*.105,dy*.105,np.ones_like(dx)),axis=-1)
    normal/=np.linalg.norm(normal,axis=2,keepdims=True)
    surface=np.empty_like(colour)
    surface[:,:,0]=255
    surface[:,:,1]=np.clip(rough,.16,1)*255
    surface[:,:,2]=np.clip(metal,0,1)*255
    return [Image.fromarray(im.clip(0,255).astype("uint8")) for im in (colour,(normal*.5+.5)*255,surface)]


if __name__=="__main__":
    OUT.mkdir(exist_ok=True)
    sheets=[Image.new("RGB",(N*2,N*2)) for _ in range(3)]
    for i,style in enumerate(("steel","latten","iron","hide")):
        for sheet,tile in zip(sheets,make(i,style)):
            sheet.paste(tile,(i%2*N,i//2*N))
    for sheet,name in zip(sheets,("pigment","grain","polish")):
        sheet.save(OUT/(name+".jpg"),quality=94,subsampling=0)
