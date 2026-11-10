"""Matériaux procéduraux semi-réalistes (couleur variée + relief fin).
Ils sont procéduraux : avant l'export glTF il faudra les baker en textures."""
import bpy
from common import get_mat


def _reset(m):
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return nt, b


def _noise(nt, scale, detail, rough, coord):
    n = nt.nodes.new('ShaderNodeTexNoise')
    n.inputs['Scale'].default_value = scale
    n.inputs['Detail'].default_value = detail
    n.inputs['Roughness'].default_value = rough
    nt.links.new(coord.outputs['Object'], n.inputs['Vector'])
    return n


def _ramp(nt, fac_out, stops):
    r = nt.nodes.new('ShaderNodeValToRGB')
    el = r.color_ramp.elements
    el[0].position = stops[0][0]
    el[0].color = (*stops[0][1], 1.0)
    el[1].position = stops[-1][0]
    el[1].color = (*stops[-1][1], 1.0)
    for p, c in stops[1:-1]:
        e = el.new(p)
        e.color = (*c, 1.0)
    nt.links.new(fac_out, r.inputs['Fac'])
    return r


def earthy(name, stops, rough=0.95, big=0.05, fine=3.0, bump=0.4, ripples=False):
    m = get_mat(name, (0.5, 0.5, 0.5), rough)
    nt, b = _reset(m)
    tc = nt.nodes.new('ShaderNodeTexCoord')
    n1 = _noise(nt, big, 4, 0.5, tc)
    ramp = _ramp(nt, n1.outputs['Fac'], stops)
    n2 = _noise(nt, fine, 8, 0.6, tc)
    bm = nt.nodes.new('ShaderNodeBump')
    bm.inputs['Strength'].default_value = bump
    bm.inputs['Distance'].default_value = 0.1
    nt.links.new(n2.outputs['Fac'], bm.inputs['Height'])
    normal = bm.outputs['Normal']
    if ripples:
        w = nt.nodes.new('ShaderNodeTexWave')
        w.wave_type = 'BANDS'
        w.inputs['Scale'].default_value = 0.9
        w.inputs['Distortion'].default_value = 9.0
        w.inputs['Detail'].default_value = 2.0
        nt.links.new(tc.outputs['Object'], w.inputs['Vector'])
        bm2 = nt.nodes.new('ShaderNodeBump')
        bm2.inputs['Strength'].default_value = 0.25
        bm2.inputs['Distance'].default_value = 0.1
        nt.links.new(w.outputs['Fac'], bm2.inputs['Height'])
        nt.links.new(normal, bm2.inputs['Normal'])
        normal = bm2.outputs['Normal']
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(normal, b.inputs['Normal'])
    b.inputs['Roughness'].default_value = rough
    return m


def run():
    earthy("Sable", [(0.0, (0.48, 0.25, 0.08)), (0.5, (0.72, 0.45, 0.18)), (1.0, (0.90, 0.66, 0.34))],
           rough=0.95, big=0.03, fine=2.5, bump=0.5, ripples=True)
    earthy("Banco", [(0.0, (0.34, 0.20, 0.10)), (1.0, (0.58, 0.36, 0.20))], big=0.35, fine=4.0, bump=0.9)
    earthy("Banco_Clair", [(0.0, (0.55, 0.38, 0.22)), (1.0, (0.78, 0.58, 0.38))], big=0.35, fine=4.0, bump=0.9)
    earthy("Mur_Fort", [(0.0, (0.46, 0.31, 0.18)), (1.0, (0.70, 0.50, 0.32))], big=0.25, fine=3.5, bump=1.0)
    earthy("Roche", [(0.0, (0.20, 0.14, 0.11)), (1.0, (0.50, 0.38, 0.30))], big=0.6, fine=5.0, bump=1.2)
    earthy("Toile", [(0.0, (0.66, 0.56, 0.38)), (1.0, (0.86, 0.77, 0.58))], big=0.3, fine=25.0, bump=0.3)
    earthy("Bois", [(0.0, (0.18, 0.11, 0.06)), (1.0, (0.38, 0.26, 0.15))], big=1.0, fine=12.0, bump=0.6)
    earthy("Bois_Mort", [(0.0, (0.20, 0.15, 0.11)), (1.0, (0.45, 0.37, 0.30))], big=1.0, fine=10.0, bump=0.6)
    earthy("Tronc", [(0.0, (0.25, 0.17, 0.10)), (1.0, (0.45, 0.33, 0.20))], big=1.0, fine=10.0, bump=0.8)
    earthy("Palme", [(0.0, (0.07, 0.22, 0.05)), (1.0, (0.27, 0.46, 0.12))], rough=0.6, big=1.2, fine=10.0, bump=0.2)
    earthy("Herbe", [(0.0, (0.18, 0.28, 0.07)), (1.0, (0.42, 0.50, 0.16))], rough=0.8, big=2.0, fine=10.0, bump=0.2)
    earthy("Rouille", [(0.0, (0.25, 0.10, 0.05)), (1.0, (0.55, 0.28, 0.12))], rough=0.7, big=1.5, fine=8.0, bump=0.4)

    w = get_mat("Eau", (0.02, 0.2, 0.22), 0.05)
    nt, b = _reset(w)
    b.inputs['Base Color'].default_value = (0.02, 0.20, 0.22, 1.0)
    b.inputs['Roughness'].default_value = 0.04
    b.inputs['Alpha'].default_value = 0.85
    try:
        w.surface_render_method = 'BLENDED'
    except Exception:
        pass
