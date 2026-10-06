"""Plot and verify explicit mesh-edge rings; no geometry mutation."""
import json, sys, math
from pathlib import Path
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
sys.path.insert(0,str(Path(__file__).resolve().parent))
from authored_human_v5_weights import RINGS,ALIASES,PATCHES
ROOT=Path(__file__).resolve().parents[2]
D=ROOT/'test-results/authored-human-v5'; d=json.loads((D/'source-inspection.json').read_text())
vs=d['vertices']; p=np.array(d['rig']['lowerarm_l']['head'])
canon={v:k for k,v in ALIASES.items()}
edges={tuple(sorted([canon.get(i,i) for i in e])) for e in d['edges']}
summary={}
fig,axs=plt.subplots(2,2,figsize=(16,12))
local={i for ids in RINGS.values() for i in ids}|{i for ids in PATCHES.values() for i in ids}
co={i:(np.array(vs[i]['co'])-p)*1000 for i in local}
for ax,(x,y) in zip(axs.flat,[(0,1),(0,2),(1,2),(0,3)]):
    xy={i:(v[x],v[y] if y<3 else math.degrees(math.atan2(v[2],v[1]))) for i,v in co.items()}
    for a,b in edges:
        if a in xy and b in xy and (y!=3 or abs(xy[a][1]-xy[b][1])<180):
            ax.plot([xy[a][0],xy[b][0]],[xy[a][1],xy[b][1]],color='.82',lw=.6,zorder=0)
    for n,(ring,ids) in enumerate(RINGS.items()):
        ax.scatter(*zip(*(xy[i] for i in ids)),s=18,label=ring,color=plt.cm.tab10(n))
        for a,b in zip(ids,ids[1:]+ids[:1]):
            if y!=3 or abs(xy[a][1]-xy[b][1])<180:
                ax.plot([xy[a][0],xy[b][0]],[xy[a][1],xy[b][1]],lw=1,color=plt.cm.tab10(n))
    ax.axhline(0,color='.3',ls=':',lw=.8);ax.axvline(0,color='.3',ls=':',lw=.8)
    ax.set(xlabel=['Along arm (mm)','Rearward (mm)'][x==1],ylabel={1:'Rearward (mm): inner < 0 < outer',2:'Height (mm)',3:'Circumference angle (degrees)'}[y])
    if y<3: ax.set_aspect('equal')
axs[0,0].legend(ncol=5,fontsize=8);axs[1,1].set_yticks([-180,-90,0,90,180],['inner','inferior','outer','superior','inner'])
fig.suptitle('V5 topology assessment: original mesh edges and explicit anatomical rings\nPivot at origin. Seam aliases retained; outer-tip patch adds two partial rows.',fontsize=14)
fig.tight_layout();fig.savefig(D/'topology-rings.png',dpi=130)
for ring,ids in RINGS.items():
    missing=[(a,b) for a,b in zip(ids,ids[1:]+ids[:1]) if tuple(sorted([a,b])) not in edges]
    summary[ring]={'vertices':ids,'alongMm':[round(min(co[i][0] for i in ids),2),round(max(co[i][0] for i in ids),2)],'missingEdges':missing,
        'edgeLengthMm':[round(min(np.linalg.norm(co[a]-co[b]) for a,b in zip(ids,ids[1:]+ids[:1])),2),round(max(np.linalg.norm(co[a]-co[b]) for a,b in zip(ids,ids[1:]+ids[:1])),2)],
        'childWeights':[round(vs[i]['w'].get('lowerarm_l',0),4) for i in ids]}
(D/'topology.json').write_text(json.dumps({'rings':summary,'aliases':ALIASES,'patches':PATCHES},indent=2))
print(json.dumps({k:{n:v for n,v in s.items() if n not in ['vertices','childWeights']} for k,s in summary.items()},indent=2))

# Preserve complete local source weights, ring spacing and edge directions.
from authored_human_v5_weights import left_paint
final_paint=left_paint('final')
v4_manifest=json.loads((ROOT/'tools/blender-character/experimental/authored-human-v4/weights.json').read_text())
v4_paint={v['id']:v['after'].get('lowerarm_l',0) for v in v4_manifest['changedVertices'] if v['region']=='elbow_l'}
all_local=local|set(ALIASES.values())
local_records=[{'id':i,'co':vs[i]['co'],'normal':vs[i]['normal'],'mirrors':vs[i]['mirrors'],'ring':next((r for r,ids in RINGS.items() if i in ids or i in [ALIASES.get(j) for j in ids]),None),
    'v3':vs[i]['w'],'v4Lowerarm':v4_paint.get(i,vs[i]['w'].get('lowerarm_l',0)),
    'v5Lowerarm':final_paint.get(i,vs[i]['w'].get('lowerarm_l',0))} for i in sorted(all_local)]
spacing=[]
ring_rows=list(RINGS.items())
for (a,ai),(b,bi) in zip(ring_rows,ring_rows[1:]):
    connections=[(i,j) for i in ai for j in bi if tuple(sorted([i,j])) in edges]
    lengths=[float(np.linalg.norm(co[i]-co[j])) for i,j in connections]
    spacing.append({'between':[a,b],'meshEdges':len(connections),'minEdgeMm':min(lengths),'maxEdgeMm':max(lengths),
        'meanLongitudinalGapMm':float(np.mean([co[i][0] for i in bi])-np.mean([co[i][0] for i in ai]))})
local_edges=[e for e in d['edges'] if all(i in all_local for i in e)]
local_faces=[f for f in d['faces'] if all(i in all_local for i in f)]
report={'sourceSha256':d['sourceSha256'],'pivot':p.tolist(),'rings':summary,'aliases':ALIASES,'patches':PATCHES,
    'spacing':spacing,'vertices':local_records,'edges':local_edges,'faces':local_faces,
    'notes':['Closed rings verified against original edges with coincident seam aliases for analysis only.',
        'Coordinates and topology are never welded or edited. P3,D3,D4 are unchanged boundary/context rings.']}
(D/'topology.json').write_text(json.dumps(report,indent=2))
fig,axs=plt.subplots(1,3,figsize=(18,11),sharex=True,sharey=True)
xy={i:((np.array(vs[i]['co'])-p)[0]*1000,math.degrees(math.atan2(vs[i]['co'][2]-p[2],vs[i]['co'][1]-p[1]))) for i in all_local}
for ax,(title,field) in zip(axs,[('V3 source','v3'),('V4 analytic (rejected)','v4Lowerarm'),('V5 ring-authored (rejected)','v5Lowerarm')]):
    for a,b in local_edges:
        if abs(xy[a][1]-xy[b][1])<180:ax.plot([xy[a][0],xy[b][0]],[xy[a][1],xy[b][1]],color='.78',lw=.6,zorder=0)
    c=[r['v3'].get('lowerarm_l',0) if field=='v3' else r[field] for r in local_records]
    sc=ax.scatter(*zip(*(xy[r['id']] for r in local_records)),c=c,s=26,vmin=0,vmax=1,cmap='coolwarm')
    ax.axvline(0,color='.3',ls='--',lw=1);ax.set_title(title);ax.set_xlabel('Distance from pivot (mm)')
    ax.set_yticks([-180,-90,0,90,180],['inner','inferior','outer','superior','inner'])
fig.colorbar(sc,ax=axs,label='Lower-arm influence (upper-arm is complement)',shrink=.65)
fig.suptitle('Complete left elbow circumference: source mesh edges and weights; same ring topology',fontsize=15)
fig.savefig(D/'weights-circumference.png',dpi=135,bbox_inches='tight')
print('LOCAL_TOPOLOGY',len(all_local),'vertices',len(local_edges),'edges',len(local_faces),'faces')
