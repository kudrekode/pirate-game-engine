"""Make browser thumbnails and a side-by-side index from the actual exported-model renders."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageOps

ROOT=Path(__file__).resolve().parents[3]
PLATES=ROOT/"docs/assets/art-library"
MODELS=ROOT/"public/assets/hollow-kingdom/art-library"
SOURCES=ROOT/"tools/hollow-kingdom/art-library"
# Families have separate capture recipes. Patterns select evidence from the same camera for both columns.
ENTRIES=[
    ("Oswin, Ferry Warden","humans/oswin","humans/{}-portrait.png"),
    ("Edric, Bell Court Keeper","humans/keeper/keeper","humans/keeper/{}-portrait.png"),
    ("Blackwater Wyrm","creatures/blackwater-wyrm","creatures/{}-head.jpg"),
    ("Bracken, Road Mare","creatures/bracken-road-mare","creatures/bracken-{}-whole.jpg"),
    ("Heron Well","waterworks/heron-well","waterworks/heron-well-{}.jpg"),
    ("Tide Lantern","waterworks/tide-lantern","waterworks/tide-lantern-detail-{}.jpg"),
    ("Heron Hanger","armoury/heron-hanger","armoury/whole-{}.jpg"),
]


def font(size,bold=False):
    for file in (("segoeuib.ttf" if bold else "segoeui.ttf"),("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")):
        try: return ImageFont.truetype(file,size)
        except OSError: continue
    return ImageFont.load_default(size=size)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--asset",choices=[s[1] for s in ENTRIES])
    parser.add_argument("--check-play",action="store_true",help="Match the finished models against the Play capture and save the checkpoint index")
    opts=parser.parse_args()
    sheet=Image.new("RGB",(1064,110+len(ENTRIES)*325+24),(20,28,31))
    pen=ImageDraw.Draw(sheet)
    pen.text((32,16),"The Heron’s Well",font=font(37,True),fill=(239,232,212))
    for x,label in [(32,"SHIPPED ASSET"),(542,"LIBRARY EDITION")]:
        pen.text((x,77),label,font=font(16,True),fill=(167,186,177))
    captured = json.loads((PLATES/"play/after.json").read_text())["assets"] if opts.check_play else {}
    index=[]
    for i,(title,asset,pattern) in enumerate(ENTRIES):
        if opts.asset and asset!=opts.asset: continue
        if opts.check_play:
            glb=MODELS/(asset+".glb")
            blend=SOURCES/(asset+".blend")
            digest=hashlib.sha256(glb.read_bytes()).hexdigest()
            assert digest==captured["/"+glb.relative_to(ROOT/"public").as_posix()], f"Capture out of date: {title}"
            index.append({"name":title,"source":blend.relative_to(ROOT).as_posix(),
                          "sourceSha256":hashlib.sha256(blend.read_bytes()).hexdigest(),
                          "glb":glb.relative_to(ROOT).as_posix(),"glbSha256":digest,
                          "before":(PLATES/pattern.format("before")).relative_to(ROOT).as_posix(),
                          "after":(PLATES/pattern.format("after")).relative_to(ROOT).as_posix()})
        top=110+i*325
        pen.text((32,top),title,font=font(22),fill=(243,239,225))
        for col,state in enumerate(("before","after")):
            source=Image.open(PLATES/pattern.format(state)).convert("RGB")
            left=32+col*510
            view=ImageOps.contain(source,(492,276),Image.Resampling.LANCZOS)
            # Side padding uses a colour from the original studio background.
            field=Image.new("RGB",(492,276),source.getpixel((2,2)))
            field.paste(view,((492-view.width)//2,(276-view.height)//2))
            sheet.paste(field,(left,top+36))
            if state=="after":
                image=ImageOps.contain(source,(256,192),Image.Resampling.LANCZOS)
                thumb=Image.new("RGB",(256,192),source.getpixel((2,2)))
                thumb.paste(image,((256-image.width)//2,(192-image.height)//2))
                thumb.save(MODELS/(asset+".jpg"),quality=92)
    if not opts.asset: sheet.save(PLATES/"comparison.jpg",quality=93,optimize=True)
    if not opts.asset and opts.check_play:
        (PLATES/"checkpoint.json").write_text(json.dumps(index,indent="\t")+"\n",encoding="utf-8")


if __name__=="__main__":
    main()
