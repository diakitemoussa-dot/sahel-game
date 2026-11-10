// Compresse un .glb sans perte visible : doublons supprimés, géométrie recodée en Meshopt avec une précision élevée
// (positions et coordonnées de texture en 16 bits, normales en 12 bits), description du fichier allégée.
// Option --merge-skinned : regroupe les pièces d'une même tenue qui partagent le même matériau et le même squelette
// (même image, beaucoup moins de pièces à dessiner et de squelettes à mettre à jour). À réserver aux tenues :
// le personnage de base garde ses pièces séparées (le jeu cache Hoodie, Pants, Shoes, Hair_Twists par leur nom).
//
// Option --merge-static : regroupe les pièces fixes d'un objet (véhicule, décor) par parent et par matériau.
// Option --drop=<nom> : retire d'abord la pièce (maillage) de ce nom (et son matériau et sa texture devenus inutiles), ex. --drop=Piece_U_Ecusson.
// Usage : node compress_glb.mjs <entrée.glb> <sortie.glb> [--merge-skinned] [--merge-static] [--drop=<nom>]
// Dépend de @gltf-transform installé avec : npm i -g @gltf-transform/cli  (dossier trouvé via NM ci-dessous)
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

const NM = process.env.GLTF_TRANSFORM_NM
  || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@gltf-transform', 'cli', 'node_modules');
const req = createRequire(path.join(NM, 'x.js'));
const { NodeIO } = req('@gltf-transform/core');
const { ALL_EXTENSIONS } = req('@gltf-transform/extensions');
const { dedup, prune, meshopt } = req('@gltf-transform/functions');
const { MeshoptDecoder, MeshoptEncoder } = req('meshoptimizer');

const [inp, out] = process.argv.slice(2, 4);
const MERGE = process.argv.includes('--merge-skinned');
const MERGE_STATIC = process.argv.includes('--merge-static');
const DROP = process.argv.find((a) => a.startsWith('--drop='))?.slice(7);
if (!inp || !out) { console.error('usage : node compress_glb.mjs <entrée.glb> <sortie.glb> [--merge-skinned] [--merge-static]'); process.exit(1); }

/** Regroupe, pour chaque squelette, les maillages skinnés par matériau. */
function mergeSkinned() {
  return async (doc) => {
    const root = doc.getRoot();
    const buffer = root.listBuffers()[0];
    const groups = new Map();                              // skin -> matériau -> [{prim}]
    const nodes = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
    for (const n of nodes) {
      for (const p of n.getMesh().listPrimitives()) {
        if (p.getMode() !== 4 || !p.getIndices()) throw new Error(`primitive non triangulaire : ${n.getName()}`);
        const sk = n.getSkin(); const mat = p.getMaterial();
        if (!groups.has(sk)) groups.set(sk, { parent: n.getParentNode(), mats: new Map() });
        const g = groups.get(sk).mats;
        if (!g.has(mat)) g.set(mat, []);
        g.get(mat).push(p);
      }
    }
    const scene = root.listScenes()[0];
    for (const [skin, { parent, mats }] of groups) {
      for (const [mat, prims] of mats) {
        const attrs = ['POSITION', 'NORMAL', 'TEXCOORD_0', 'JOINTS_0', 'WEIGHTS_0'];
        for (const p of prims) for (const s of p.listSemantics()) if (!attrs.includes(s)) throw new Error(`attribut non géré : ${s}`);
        const comps = { POSITION: 3, NORMAL: 3, TEXCOORD_0: 2, JOINTS_0: 4, WEIGHTS_0: 4 };
        const total = prims.reduce((a, p) => a + p.getAttribute('POSITION').getCount(), 0);
        const nIdx = prims.reduce((a, p) => a + p.getIndices().getCount(), 0);
        const arr = {}; for (const s of attrs) arr[s] = s === 'JOINTS_0' ? new Uint16Array(total * 4) : new Float32Array(total * comps[s]);
        const idx = new Uint32Array(nIdx);
        let v0 = 0, i0 = 0; const el = [];
        for (const p of prims) {
          const cnt = p.getAttribute('POSITION').getCount();
          for (const s of attrs) {
            const a = p.getAttribute(s); const c = comps[s];
            if (!a) { if (s === 'TEXCOORD_0') continue; throw new Error(`attribut ${s} manquant`); }   // pièce sans UV : zéros (matériau sans texture)
            for (let v = 0; v < cnt; v++) { a.getElement(v, el); for (let k = 0; k < c; k++) arr[s][(v0 + v) * c + k] = el[k]; }
          }
          const ia = p.getIndices(); const ic = ia.getCount();
          for (let i = 0; i < ic; i++) idx[i0 + i] = ia.getScalar(i) + v0;
          v0 += cnt; i0 += ic;
        }
        const types = { POSITION: 'VEC3', NORMAL: 'VEC3', TEXCOORD_0: 'VEC2', JOINTS_0: 'VEC4', WEIGHTS_0: 'VEC4' };
        const prim = doc.createPrimitive().setMaterial(mat);
        for (const s of attrs.filter((x) => x !== 'TEXCOORD_0' || prims.some((p) => p.getAttribute('TEXCOORD_0')))) prim.setAttribute(s, doc.createAccessor().setType(types[s]).setArray(arr[s]).setBuffer(buffer));
        prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
        const mesh = doc.createMesh(`Piece_${mat ? mat.getName() : 'sans_materiau'}`).addPrimitive(prim);
        const node = doc.createNode(mesh.getName()).setMesh(mesh).setSkin(skin);
        (parent ?? scene).addChild(node);
      }
    }
    for (const n of nodes) { const m = n.getMesh(); n.dispose(); m.listPrimitives().forEach((p) => p.dispose()); m.dispose(); }
  };
}

/** Regroupe les maillages FIXES (sans squelette) qui ont le même parent, le même matériau et les mêmes attributs en un seul maillage :
 *  beaucoup moins d'objets à dessiner. Le matrice locale de chaque nœud est appliquée aux sommets. Les nœuds qui doivent bouger
 *  (roues, tourelle, canons) restent des parents distincts : leurs pièces ne sont regroupées qu'entre elles. */
function mergeStatic() {
  return async (doc) => {
    const root = doc.getRoot();
    const buffer = root.listBuffers()[0];
    const ids = new Map(); const id = (o) => { if (!ids.has(o)) ids.set(o, ids.size); return ids.get(o); };
    const groups = new Map();
    for (const node of root.listNodes()) {
      const mesh = node.getMesh();
      if (!mesh || node.getSkin() || node.listChildren().length) continue;
      const prims = mesh.listPrimitives();
      if (prims.length !== 1) continue;
      const p = prims[0];
      if (p.getMode() !== 4 || !p.getIndices() || p.listTargets().length) continue;
      const sems = p.listSemantics().sort();
      const key = [id(node.getParentNode() ?? root), id(p.getMaterial() ?? root), sems.join(','), sems.map((s) => p.getAttribute(s).getType()).join(',')].join('|');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ node, p, sems });
    }
    let merged = 0; const toCheck = new Set();
    for (const list of groups.values()) {
      if (list.length < 2) continue;
      const { sems } = list[0];
      const comps = Object.fromEntries(sems.map((s) => [s, list[0].p.getAttribute(s).getElementSize()]));
      const total = list.reduce((a, { p }) => a + p.getAttribute('POSITION').getCount(), 0);
      const nIdx = list.reduce((a, { p }) => a + p.getIndices().getCount(), 0);
      const arr = Object.fromEntries(sems.map((s) => [s, new Float32Array(total * comps[s])]));
      const idx = new Uint32Array(nIdx);
      let v0 = 0, i0 = 0; const el = [];
      for (const { node, p } of list) {
        const M = node.getMatrix();                                                 // matrice locale, colonnes : [0..3] [4..7] [8..11] [12..15]
        const a = M[0], b = M[4], c = M[8], d = M[1], e = M[5], f = M[9], g = M[2], h = M[6], k = M[10];
        const det = a * (e * k - f * h) - b * (d * k - f * g) + c * (d * h - e * g);
        const inv = [(e * k - f * h) / det, (c * h - b * k) / det, (b * f - c * e) / det, (f * g - d * k) / det, (a * k - c * g) / det, (c * d - a * f) / det, (d * h - e * g) / det, (b * g - a * h) / det, (a * e - b * d) / det];
        const cnt = p.getAttribute('POSITION').getCount();
        for (const s of sems) {
          const acc = p.getAttribute(s); const c0 = comps[s];
          for (let v = 0; v < cnt; v++) {
            acc.getElement(v, el);
            const o = (v0 + v) * c0;
            if (s === 'POSITION') {
              arr[s][o] = M[0] * el[0] + M[4] * el[1] + M[8] * el[2] + M[12];
              arr[s][o + 1] = M[1] * el[0] + M[5] * el[1] + M[9] * el[2] + M[13];
              arr[s][o + 2] = M[2] * el[0] + M[6] * el[1] + M[10] * el[2] + M[14];
            } else if (s === 'NORMAL') {                                              // normale : inverse transposée de la matrice 3x3, puis renormalisée
              const nx = inv[0] * el[0] + inv[3] * el[1] + inv[6] * el[2], ny = inv[1] * el[0] + inv[4] * el[1] + inv[7] * el[2], nz = inv[2] * el[0] + inv[5] * el[1] + inv[8] * el[2];
              const l = Math.hypot(nx, ny, nz) || 1;
              arr[s][o] = nx / l; arr[s][o + 1] = ny / l; arr[s][o + 2] = nz / l;
            } else for (let q = 0; q < c0; q++) arr[s][o + q] = el[q];                 // getElement renvoie déjà les valeurs normalisées (0..1)
          }
        }
        const ia = p.getIndices(), ic = ia.getCount();
        const flip = det < 0;                                                        // miroir : l'ordre des sommets des triangles s'inverse
        for (let i = 0; i < ic; i += 3) {
          const t0 = ia.getScalar(i) + v0, t1 = ia.getScalar(i + 1) + v0, t2 = ia.getScalar(i + 2) + v0;
          idx[i0 + i] = t0; idx[i0 + i + 1] = flip ? t2 : t1; idx[i0 + i + 2] = flip ? t1 : t2;
        }
        v0 += cnt; i0 += ic;
      }
      const mat = list[0].p.getMaterial();
      const prim = doc.createPrimitive().setMaterial(mat);
      for (const s of sems) {
        const t = list[0].p.getAttribute(s).getType();
        prim.setAttribute(s, doc.createAccessor().setType(t).setArray(arr[s]).setBuffer(buffer));
      }
      prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(idx).setBuffer(buffer));
      const parent = list[0].node.getParentNode();
      const mesh = doc.createMesh(`Groupe_${mat ? mat.getName() : 'sans_materiau'}`).addPrimitive(prim);
      const node = doc.createNode(mesh.getName()).setMesh(mesh);
      (parent ?? doc.getRoot().listScenes()[0]).addChild(node);
      for (const { node: n } of list) { toCheck.add(n.getMesh()); n.dispose(); }    // un maillage peut être partagé par plusieurs nœuds (doublons fusionnés) : on ne le supprime qu'à la fin
      merged += list.length;
    }
    for (const m of toCheck) {
      if (m.listParents().every((par) => par.propertyType !== 'Node')) { m.listPrimitives().forEach((p) => p.dispose()); m.dispose(); }
    }
    console.log(`regroupement : ${merged} pièces fixes -> ${[...groups.values()].filter((l) => l.length > 1).length} maillages`);
  };
}

/** Retire les nœuds dont le maillage porte ce nom. */
function dropMesh(name) {
  return async (doc) => {
    let n = 0;
    for (const node of doc.getRoot().listNodes()) { if (node.getMesh()?.getName() === name) { node.dispose(); n++; } }
    for (const m of doc.getRoot().listMeshes()) {
      if (m.getName() === name && m.listParents().every((par) => par.propertyType !== 'Node')) { m.listPrimitives().forEach((p) => p.dispose()); m.dispose(); }
    }
    console.log(`pièce « ${name} » retirée : ${n} nœud(s)`);
  };
}

await MeshoptDecoder.ready; await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });
const doc = await io.read(inp);
const steps = DROP ? [dropMesh(DROP), dedup()] : [dedup()];
if (MERGE) steps.push(mergeSkinned());
if (MERGE_STATIC) steps.push(mergeStatic());
steps.push(prune({ keepLeaves: true }), meshopt({ encoder: MeshoptEncoder, level: 'high', quantizePosition: 16, quantizeTexcoord: 16,
                             quantizeNormal: 12, quantizeWeight: 10, quantizeGeneric: 14 }));
await doc.transform(...steps);
await io.write(out, doc);
const kb = (f) => (fs.statSync(f).size / 1e6).toFixed(2);
console.log(`${path.basename(inp)} ${kb(inp)} Mo -> ${path.basename(out)} ${kb(out)} Mo`);
