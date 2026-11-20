"""Sculpt the three Naranhi companions and export animated glTF 2.0 binaries."""

import json
import math
import struct
from pathlib import Path

import numpy as np


OUT = Path(__file__).resolve().parents[1] / "public" / "companions"
TAU = 2 * math.pi
PALETTE = {
    "cream": "FFEAD1", "plush": "F7DDBF", "wax": "FFCB9C", "wing": "C3A6E8",
    "dusk": "AC8ACF", "peach": "F6B899", "gold": "F2B560", "light": "FFDF94",
    "iris": "432E47", "white": "FFF9E9", "mint": "92DACE", "sea": "69BCB9",
    "shell": "C198DB", "violet": "9D78B6", "apricot": "FABE82", "blush": "EF9F93",
    "pearl": "D2F3ED",
}


def linear(hex_value):
    rgb = [int(hex_value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb]


def rotation(axis, degrees):
    half = math.radians(degrees) / 2
    return [*(np.array(axis) * math.sin(half)), math.cos(half)]


def smooth(points, steps=5, closed=False):
    p = np.array(points, dtype=float)
    result = []
    for i in range(len(p) if closed else len(p) - 1):
        def point(j):
            return p[j % len(p)] if closed else p[min(max(j, 0), len(p) - 1)]
        a, b, c, d = [point(j) for j in range(i - 1, i + 3)]
        for t in np.arange(steps) / steps:
            result.append(0.5 * (2*b + (-a+c)*t + (2*a-5*b+4*c-d)*t*t + (-a+3*b-3*c+d)*t**3))
    return np.array(result if closed else [*result, p[-1]])


def rings(rows):
    """Join equally spaced section loops, each with a single shared seam."""
    n = len(rows[0])
    faces = []
    for j in range(len(rows) - 1):
        for i in range(n):
            a, b = j*n+i, j*n+(i+1) % n
            faces.extend([(a, b, a+n), (b, b+n, a+n)])
    return np.vstack(rows), np.array(faces)


class Model:
    def __init__(self, name):
        self.data = bytearray()
        self.doc = dict(asset={"version": "2.0", "generator": "Naranhi companion studio"},
                        scene=0, scenes=[{"nodes": [0]}], nodes=[{"name": name}], meshes=[],
                        materials=[], buffers=[], bufferViews=[], accessors=[], animations=[])
        self.spheres = {}
        self.colors = {}

    def accessor(self, data, kind, indices=False):
        a = np.asarray(data, dtype="<u2" if indices else "<f4").reshape(-1, {"VEC3": 3, "VEC4": 4, "SCALAR": 1}[kind])
        self.data.extend(bytes(-len(self.data) % 4))
        view = {"buffer": 0, "byteOffset": len(self.data), "byteLength": a.nbytes}
        self.data.extend(a.tobytes())
        self.doc["bufferViews"].append(view)
        self.doc["accessors"].append(dict(bufferView=len(self.doc["bufferViews"])-1,
            componentType=5123 if indices else 5126, count=len(a), type=kind,
            min=a.min(axis=0).tolist(), max=a.max(axis=0).tolist()))
        return len(self.doc["accessors"])-1

    def node(self, name, parent=0, **kwargs):
        nodes = self.doc["nodes"]
        nodes[parent].setdefault("children", []).append(len(nodes))
        nodes.append(dict(name=name, **kwargs))
        return len(nodes)-1

    def geometry(self, vertices, faces, color):
        v, f = np.asarray(vertices), np.array(faces)
        a, b, c = v[f[:, 0]], v[f[:, 1]], v[f[:, 2]]
        if np.sum(a*np.cross(b, c)) < 0:
            f = f[:, [0, 2, 1]]
        normals = np.zeros_like(v, dtype=float)
        normals_face = np.cross(v[f[:, 1]]-v[f[:, 0]], v[f[:, 2]]-v[f[:, 0]])
        for col in range(3):
            np.add.at(normals, f[:, col], normals_face)
        normals[np.linalg.norm(normals, axis=1) < 1e-12] = [0,1,0]
        normals /= np.linalg.norm(normals, axis=1, keepdims=True)
        if color not in self.colors:
            self.colors[color] = len(self.doc["materials"])
            self.doc["materials"].append({"name": color, "pbrMetallicRoughness": {
                "baseColorFactor": [*linear(PALETTE[color]), 1], "metallicFactor": 0.26 if color in ("light", "gold") else 0.04,
                "roughnessFactor": 0.27 if color in ("iris", "pearl") else 0.58}})
        primitive = dict(attributes={"POSITION": self.accessor(v, "VEC3"), "NORMAL": self.accessor(normals, "VEC3")},
                         indices=self.accessor(f, "SCALAR", True), material=self.colors[color])
        self.doc["meshes"].append({"primitives": [primitive]})
        return len(self.doc["meshes"])-1

    def ball(self, name, center, size, color, parent=0, rot=None):
        if color not in self.spheres:
            rows = []
            for lat in np.linspace(-math.pi/2+.001, math.pi/2-.001, 19):
                rows.append([(math.cos(lat)*math.cos(t), math.sin(lat), math.cos(lat)*math.sin(t)) for t in np.arange(32)*TAU/32])
            v, f = rings(rows)
            self.spheres[color] = self.geometry(v, f, color)
        return self.node(name, parent, mesh=self.spheres[color], translation=list(center), scale=list(size),
                         **({"rotation": rot} if rot else {}))

    def cushion(self, name, outline, z, depth, color, parent=0):
        edge = smooth(outline, closed=True)
        mid = edge.mean(axis=0)
        rows = []
        for t in np.linspace(-math.pi/2+.002, math.pi/2-.002, 15):
            xy = mid + (edge-mid)*math.cos(t)
            rows.append(np.column_stack([xy, np.full(len(xy), z+depth*math.sin(t))]))
        return self.node(name, parent, mesh=self.geometry(*rings(rows), color))

    def tube(self, name, points, radius, color, parent=0):
        path = smooth(points, 6)
        rows = []
        for p, tangent in zip(path, np.gradient(path, axis=0)):
            tangent /= np.linalg.norm(tangent)
            ref = [0, 0, 1] if abs(tangent[2]) < .9 else [0, 1, 0]
            side = np.cross(tangent, ref)
            side /= np.linalg.norm(side)
            up = np.cross(side, tangent)
            rows.append([p+radius*(side*math.cos(t)+up*math.sin(t)) for t in np.arange(10)*TAU/10])
        return self.node(name, parent, mesh=self.geometry(*rings(rows), color))

    def animate(self, clip, node, path, keys, values):
        animations = self.doc["animations"]
        anim = next((a for a in animations if a["name"] == clip), None)
        if anim is None:
            anim = dict(name=clip, channels=[], samplers=[])
            animations.append(anim)
        anim["channels"].append(dict(sampler=len(anim["samplers"]), target={"node": node, "path": path}))
        anim["samplers"].append(dict(input=self.accessor(keys, "SCALAR"), interpolation="LINEAR",
                                     output=self.accessor(values, "VEC4" if path == "rotation" else "VEC3")))

    def write(self, filename):
        self.doc["buffers"] = [{"byteLength": len(self.data)}]
        j = json.dumps(self.doc, ensure_ascii=False, separators=(",", ":")).encode()
        j += b" " * (-len(j) % 4)
        self.data.extend(bytes(-len(self.data) % 4))
        length = 28 + len(j) + len(self.data)
        (OUT / filename).write_bytes(struct.pack("<4sII", b"glTF", 2, length) +
            struct.pack("<I4s", len(j), b"JSON") + j + struct.pack("<I4s", len(self.data), b"BIN\0") + self.data)


def eye(m, p, size, side=1):
    x, y, z = p
    m.ball("Obsidian eye", p, (size*.83, size, size*.48), "iris")
    m.ball("Catchlight", (x-size*.19, y+size*.31, z+side*size*.40), (size*.20,)*3, "white")


def moth():
    m = Model("새빛 · Dawn moth")
    for side in (-1, 1):
        wing = m.node("Wing hinge", translation=[side*.12, 0, 0])
        shape = [(0,.33),(.34,.61),(1.08,.86),(1.43,1.02),(1.50,.77),(1.48,.30),
                 (1.32,-.15),(1.18,-.35),(.89,-.30),(.69,-.56),(.41,-.54),(.07,-.31)]
        m.cushion("Lavender silk", [(side*x,y) for x,y in shape], 0, .155, "wing", wing)
        m.cushion("Apricot lower wing", [(side*x,y) for x,y in
            [(.09,-.19),(.38,-.29),(.76,-.38),(.61,-.64),(.32,-.73),(.09,-.48)]], -.07,.12,"peach",wing)
        for k in range(3):
            x=1.33-k*.14
            y=.43-k*.15
            m.ball("Wing dust",(side*x,y,.115+k*.016),(.036,.067,.021),"plush",wing,
                   rot=rotation((0,0,1),-side*29))
        # The entire open-wing trace is high-low-high-low-high, on either face.
        for face in (-1,1):
            points = [(side*.04,.36,face*.13),(side*.64,-.11,face*.168),(side*1.29,.71,face*.132)]
            for i in range(2):
                m.tube("Crown inlay", points[i:i+2],.023,"gold",wing)
            for x,y,z in points[1:]:
                m.ball("Crown star",(x,y,z),(0.078,0.078,.045),"light",wing)
        m.animate("Idle",wing,"rotation",[0,1.1,2.2,3.3,4.4],
                  [rotation((0,1,0),side*a) for a in (0,9,18,9,0)])
        m.animate("Greeting",wing,"rotation",[0,.48,1.0,1.5,2.0],
                  [rotation((0,1,0),side*a) for a in (0,39,0,14,0)])
    m.ball("Soft body",(0,-.15,.03),(.27,.58,.27),"plush")
    m.ball("Face",(0,.61,.10),(.34,.31,.30),"cream")
    for face in (-1,1):
        z=.395 if face==1 else -.23
        m.cushion("Crown star brooch",[(0,.446),(.028,.392),(.077,.37),(.028,.347),(0,.292),
                  (-.028,.347),(-.077,.37),(-.028,.392)],z,.034,"light")
        for s in (-1,1):
            m.tube("Crown bridge",[(0,.37,z),(s*.16,.36,face*.14)],.022,"gold")
    for s in (-1,1):
        eye(m,(s*.139,.64,.371),.061)
        m.ball("Cheek",(s*.207,.566,.333),(.047,.025,.023),"peach")
        m.ball("Velvet collar",(s*.13,.28,.16),(.17,.12,.16),"cream")
        m.tube("Feeler stalk",[(s*.12,.82,.04),(s*.17,1.01,.04),(s*.29,1.17,.04)],.026,"wax")
        m.ball("Feather antenna",(s*.29,1.11,.04),(.072,.18,.048),"peach",rot=rotation((0,0,1),-s*36))
        m.ball("Little paw",(s*.13,-.15,.253),(.084,.112,.071),"cream")
    return m


def dolphin():
    m = Model("윤슬 · Ripple dolphin")
    # Sections run continuously from the beak through the melon to the narrow tail.
    stations = [(-1.40,.10,.013,.014),(-1.30,.10,.125,.091),(-1.12,.09,.20,.14),
                (-.99,.17,.25,.23),(-.80,.24,.38,.38),(-.45,.21,.49,.49),
                (0,.10,.45,.46),(.47,-.05,.32,.32),(.85,-.20,.17,.15),
                (1.14,-.27,.077,.082),(1.25,-.25,.018,.021)]
    rows=[]
    for x,y,rz,ry in smooth(stations):
        rows.append([(x,y+ry*math.cos(t),rz*math.sin(t)) for t in np.arange(40)*TAU/40])
    v,f=rings(rows)
    # Split on fixed meridians so the ivory belly follows the sculpt, including the beak.
    belly = np.array([12 <= (i//2)%40 < 28 for i in range(len(f))])
    for mask,col in ((belly,"cream"),(~belly,"mint")):
        m.node("Porcelain body "+col,mesh=m.geometry(v,f[mask],col))
    m.cushion("Dorsal fin",[(-.18,.45),(.01,.72),(.32,.85),(.27,.57),(.41,.32)],0,.086,"sea")
    tail=m.node("Tail joint",translation=[1.10,-.26,0])
    for s in (-1,1):
        fluke=m.node("Tail fluke",tail,rotation=rotation((1,0,0),s*69))
        m.cushion("Fluke blade",[(0,0),(.12,.24),(.36,.47),(.52,.52),(.45,.25),(.23,.02),(.12,-.05)],0,.063,"mint",fluke)
        fin=m.node("Pectoral fin",translation=[-.50,-.04,s*.36],rotation=rotation((1,0,0),-s*34))
        m.cushion("Flipper",[(0,.12),(.17,.03),(.38,-.35),(.35,-.51),(.17,-.40),(-.07,-.13)],0,.078,"sea",fin)
        eye(m,(-.84,.255,s*.359),.081,s)
        m.ball("Blushing cheek",(-.76,.12,s*.365),(.091,.038,.020),"blush")
        m.tube("Smile",[(-1.35,.067,s*.10),(-1.22,.052,s*.163),(-1.09,.084,s*.202)],.013,"violet")
    bubble=m.node("Breath pearl",translation=[-.56,.94,0])
    m.ball("Pearl",(0,0,0),(.103,)*3,"pearl",bubble)
    m.ball("Pearl glint",(-.041,.048,.068),(.026,)*3,"white",bubble)
    m.animate("Idle",tail,"rotation",[0,1.25,2.5,3.75,5],[rotation((0,0,1),i) for i in (0,14,0,-14,0)])
    m.animate("Idle",0,"translation",[0,1.25,2.5,3.75,5],[[0,y,0] for y in (0,.07,0,-.07,0)])
    m.animate("Greeting",bubble,"translation",[0,.6,1.2,1.8], [[-.56,y,0] for y in (.94,1.15,1.30,.94)])
    m.animate("Greeting",0,"rotation",[0,.55,1.2,1.8],[rotation((1,0,0),i) for i in (0,-20,7,0)])
    return m


def snail():
    m=Model("도란 · Lyre snail")
    m.cushion("Travelling foot",[(-1.22,-.52),(-.8,-.40),(-.13,-.31),(.38,-.06),(.67,.30),
              (.97,.33),(1.15,.04),(1.02,-.24),(.66,-.52),(.37,-.68),(-.45,-.67),(-.98,-.62)],0,.35,"apricot")
    m.ball("Head",(.81,.12,0),(.39,.34,.36),"apricot")
    m.ball("Lavender shell",(-.29,.17,0),(.78,.8,.54),"shell")
    for s in (-1,1):
        pts=[]
        for t in np.linspace(.4,TAU*1.10,28):
            r=.045+.040*t
            x,y=-.54+r*math.cos(t),-.01+r*math.sin(t)
            z=.54*math.sqrt(max(.1,1-((x+.29)/.78)**2-((y-.17)/.8)**2))
            pts.append((x,y,s*(z+.012)))
        m.tube("Shell spiral",pts,.046,"violet")
        def shellpoint(x,y):
            z=.54*math.sqrt(max(.075,1-((x+.29)/.78)**2-((y-.17)/.8)**2))
            return (x,y,s*(z+.045))
        arc=[(-.48,.45),(-.55,.55),(-.47,.61),(-.34,.51),(-.32,.31),(-.38,-.06),
             (-.27,-.17),(-.07,-.21),(.12,-.10),(.17,.05),(.09,.30),(.06,.48),(.14,.58),(.22,.52),(.17,.46)]
        m.tube("Gilded lyre", [shellpoint(x,y) for x,y in arc],.041,"gold")
        m.tube("Lyre crossbar",[shellpoint(-.34,.45),shellpoint(-.15,.44),shellpoint(.065,.45)],.026,"light")
        for x,bottom in ((-.245,-.16),(-.13,-.18),(-.015,-.17)):
            m.tube("Harp string",[shellpoint(x,y) for y in np.linspace(bottom,.44,7)],.010,"light")
        stalk=m.node("Feeler",translation=[.78,.34,s*.15])
        m.tube("Antenna",[(0,0,0),(.042,.16,s*.045),(.13,.31,s*.10)],.035,"wax",stalk)
        m.ball("Soft antenna tip",(.13,.31,s*.1),(.075,)*3,"wax",stalk)
        m.animate("Idle",stalk,"rotation",[0,1,2,3,4],[rotation((0,0,1),s*a) for a in (0,7,0,-7,0)])
        eye(m,(.961,.192,s*.296),.073,s)
        m.ball("Cheek",(.89,.084,s*.321),(.081,.037,.026),"blush")
    m.tube("Little smile",[(1.14,.07,.15),(1.18,.047,.04),(1.16,.06,-.1)],.012,"iris")
    m.animate("Greeting",0,"translation",[0,.35,.9,1.45,2.2],[[x,y,0] for x,y in [(0,0),(-.04,.018),(.15,.06),(.20,0),(0,0)]])
    return m


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, build in [("saebit.glb",moth),("yunseul.glb",dolphin),("doran.glb",snail)]:
        build().write(filename)
