"""Maille de collision : outils partagés par s36_export_collision.py (carte) et s37_export_vehicle_collision.py (véhicule).
Chaque objet solide est remplacé par l'enveloppe convexe de sa géométrie, simplifiée (quelques dizaines de triangles) : un rocher garde sa forme de rocher,
une tente sa forme de pyramide, un mur sa forme de mur. Les objets hauts et fins (troncs de palmiers courbes) sont découpés en tranches.
Sortie : fichier binaire compact lu par le jeu (client/src/meshworld.js).

Format 'SCOL' v1 (petit-boutien) :
  4 o  'SCOL' | uint32 version | uint32 N sommets | uint32 T triangles | float32 x6 : min x, y, z puis échelle x, y, z
  N x 3 uint16 : positions quantifiées (position = min + valeur * échelle)  |  T x 3 uint32 : indices  |  T x uint16 : numéro d'objet
Repère de sortie : celui du jeu (three.js) : x, y = hauteur (z de Blender), z = -y de Blender."""
import math, struct
import bpy, bmesh
from mathutils import Vector


def to_game(v):
    return (v.x, v.z, -v.y)


def world_verts(o):
    """Sommets en repère monde (modificateurs appliqués)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ev.matrix_world
    vs = [mw @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    return vs


def _hull(points, max_tris=96):
    """Enveloppe convexe des points -> liste de triangles (3 Vector), simplifiée jusqu'à max_tris."""
    if len(points) < 4:
        return []
    bm = bmesh.new()
    for p in points:
        bm.verts.new(p)
    res = bmesh.ops.convex_hull(bm, input=bm.verts)
    extra = set(res.get("geom_interior", [])) | set(res.get("geom_unused", []))           # certains éléments figurent dans les deux listes : on dédoublonne
    bmesh.ops.delete(bm, geom=[g for g in extra if isinstance(g, bmesh.types.BMVert)], context='VERTS')
    tris = []
    for ang in (4, 9, 16, 26, 40, 60):                       # on fusionne les faces presque coplanaires de plus en plus largement
        b2 = bm.copy()
        bmesh.ops.dissolve_limit(b2, angle_limit=math.radians(ang), verts=b2.verts, edges=b2.edges)
        bmesh.ops.triangulate(b2, faces=b2.faces)
        n = len(b2.faces)
        if n <= max_tris or ang == 60:
            tris = [tuple(v.co.copy() for v in f.verts) for f in b2.faces]
            b2.free()
            break
        b2.free()
    bm.free()
    return tris


def _pad_flat(points):
    """Une plaque presque plate n'a pas d'enveloppe en 3D : on lui donne un peu d'épaisseur (1 cm)."""
    mn = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    mx = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    d = mx - mn
    if min(d) < 0.02:
        axis = min(range(3), key=lambda i: d[i])
        out = []
        for p in points:
            for s in (-0.006, 0.006):
                q = p.copy(); q[axis] += s; out.append(q)
        return out
    return points


def object_hulls(o, max_tris=96):
    """Liste de morceaux convexes (chacun : liste de triangles en repère monde) pour un objet."""
    pts = world_verts(o)
    if len(pts) < 3:
        return []
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    d = mx - mn
    pieces = []
    if d.z > 2.5 and max(d.x, d.y) < 1.6:                    # tronc haut et fin (souvent courbe) : tranches de 1,2 m
        n = int(math.ceil(d.z / 1.2))
        z0s = [mn.z + d.z * i / n for i in range(n + 1)]
        # on ajoute des sommets aux plans de coupe pour que chaque tranche ait de la matière à ses deux bouts
        bm = bmesh.new()
        dg = bpy.context.evaluated_depsgraph_get(); ev = o.evaluated_get(dg)
        me = ev.to_mesh(); bm.from_mesh(me); bmesh.ops.transform(bm, matrix=ev.matrix_world, verts=bm.verts); ev.to_mesh_clear()
        for zc in z0s[1:-1]:
            geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
            bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, zc), plane_no=(0, 0, 1))
        allv = [v.co.copy() for v in bm.verts]
        bm.free()
        for i in range(n):
            sl = [p for p in allv if z0s[i] - 1e-4 <= p.z <= z0s[i + 1] + 1e-4]
            if len(sl) >= 4:
                pieces.append(_hull(_pad_flat(sl), max_tris))
    else:
        pieces.append(_hull(_pad_flat(pts), max_tris))
    return [p for p in pieces if p]


class Builder:
    """Accumule les triangles de tous les morceaux, soude les sommets (1 cm) et écrit le fichier."""
    def __init__(self):
        self.verts = []; self.index = {}; self.tris = []; self.obj = []; self.next_obj = 0; self.names = []

    def _v(self, p):
        g = to_game(p)
        k = (round(g[0] * 100), round(g[1] * 100), round(g[2] * 100))
        i = self.index.get(k)
        if i is None:
            i = len(self.verts); self.index[k] = i; self.verts.append((k[0] / 100.0, k[1] / 100.0, k[2] / 100.0))
        return i

    def add(self, tris, name=""):
        oid = self.next_obj; self.next_obj += 1; self.names.append(name)
        for a, b, c in tris:
            ia, ib, ic = self._v(a), self._v(b), self._v(c)
            if ia == ib or ib == ic or ia == ic:
                continue
            # repère Blender -> jeu : (x, y, z) -> (x, z, -y) est une rotation (pas un miroir) : l'ordre des sommets, donc les normales vers l'extérieur, est conservé
            self.tris.append((ia, ib, ic)); self.obj.append(oid)

    def write(self, path):
        xs = [v[0] for v in self.verts]; ys = [v[1] for v in self.verts]; zs = [v[2] for v in self.verts]
        mn = (min(xs), min(ys), min(zs)); mx = (max(xs), max(ys), max(zs))
        sc = tuple(max((mx[i] - mn[i]) / 65535.0, 1e-6) for i in range(3))
        with open(path, "wb") as f:
            f.write(b"SCOL"); f.write(struct.pack("<III", 1, len(self.verts), len(self.tris)))
            f.write(struct.pack("<6f", *mn, *sc))
            for v in self.verts:
                f.write(struct.pack("<3H", *[min(65535, max(0, int(round((v[i] - mn[i]) / sc[i])))) for i in range(3)]))
            for t in self.tris:
                f.write(struct.pack("<3I", *t))
            f.write(struct.pack(f"<{len(self.obj)}H", *self.obj))
        return len(self.verts), len(self.tris), self.next_obj
