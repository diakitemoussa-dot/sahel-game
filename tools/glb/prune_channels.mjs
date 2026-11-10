// Retire d'un GLB compressé (Meshopt) les canaux d'animation inutiles, sans le décompresser.
// Un canal (os + type : position, rotation, échelle) n'est retiré que s'il est inutile dans TOUS les clips :
// constant et égal à la pose de repos du nœud partout. Retirer un canal qui sert dans un seul clip casserait les autres :
// le mixeur de three.js laisse l'os dans la pose du clip précédent quand le nouveau clip ne l'anime pas.
//
// Usage : node prune_channels.mjs <compressé.glb> <brut.glb> <sortie.glb>
//   compressé.glb : export final de s21_export_player.py (Meshopt + WebP, tous les canaux)
//   brut.glb      : même export avec SAHEL_RAW=1 (non compressé), lu seulement pour décider quels canaux sont inutiles
import { readFileSync, writeFileSync } from 'node:fs';

function parse(f) {
  const b = readFileSync(f);
  const jl = b.readUInt32LE(12);
  const json = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const binLen = b.readUInt32LE(20 + jl);
  const bin = b.slice(20 + jl + 8, 20 + jl + 8 + binLen);
  return { json, bin };
}
const [fComp, fRaw, fOut] = process.argv.slice(2);
if (!fOut) { console.error('Usage : node prune_channels.mjs <compressé.glb> <brut.glb> <sortie.glb>'); process.exit(1); }

// ---- 1) décider, sur le fichier brut, quels canaux sont inutiles dans tous les clips
const raw = parse(fRaw);
const readFloats = (g, ai) => {
  const a = g.json.accessors[ai], bv = g.json.bufferViews[a.bufferView];
  if (a.componentType !== 5126) throw new Error('accesseur non flottant dans le fichier brut (export sans SAHEL_RAW ?)');
  const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type];
  const off = (bv.byteOffset || 0) + (a.byteOffset || 0);
  return new Float32Array(g.bin.buffer.slice(g.bin.byteOffset + off, g.bin.byteOffset + off + a.count * n * 4));
};
const keyOf = (j, c) => `${j.nodes[c.target.node].name}|${c.target.path}`;
const useless = new Map();     // clé -> vrai tant que tous les clips la trouvent inutile
for (const an of raw.json.animations) {
  for (const c of an.channels) {
    const node = raw.json.nodes[c.target.node];
    const path = c.target.path;
    const rest = path === 'rotation' ? (node.rotation || [0, 0, 0, 1]) : path === 'translation' ? (node.translation || [0, 0, 0]) : (node.scale || [1, 1, 1]);
    const n = path === 'rotation' ? 4 : 3;
    const vals = readFloats(raw, an.samplers[c.sampler].output);
    let maxd = 0;
    for (let i = 0; i < vals.length; i += n) {
      let d = 0, d2 = 0;
      for (let k = 0; k < n; k++) { d = Math.max(d, Math.abs(vals[i + k] - rest[k])); d2 = Math.max(d2, Math.abs(vals[i + k] + rest[k])); }   // q et -q : même rotation
      maxd = Math.max(maxd, path === 'rotation' ? Math.min(d, d2) : d);
    }
    const k = keyOf(raw.json, c);
    useless.set(k, (useless.get(k) ?? true) && maxd < 1e-3);
  }
}
const drop = new Set([...useless].filter(([, v]) => v).map(([k]) => k));
console.log(`canaux distincts: ${useless.size} | inutiles dans tous les clips: ${drop.size}`);

// ---- 2) retirer ces canaux du fichier compressé
const { json: j, bin } = parse(fComp);
let before = 0, after = 0;
for (const an of j.animations) {
  before += an.channels.length;
  an.channels = an.channels.filter((c) => !drop.has(keyOf(j, c)));
  after += an.channels.length;
  const used = [...new Set(an.channels.map((c) => c.sampler))].sort((a, b) => a - b);
  const remap = new Map(used.map((s, i) => [s, i]));
  an.samplers = used.map((s) => an.samplers[s]);
  an.channels.forEach((c) => { c.sampler = remap.get(c.sampler); });
}
console.log(`canaux d'animation: ${before} -> ${after}`);

// accesseurs encore utilisés
const usedAcc = new Set();
for (const m of j.meshes || []) for (const p of m.primitives) {
  Object.values(p.attributes).forEach((a) => usedAcc.add(a));
  if (p.indices !== undefined) usedAcc.add(p.indices);
  for (const t of p.targets || []) Object.values(t).forEach((a) => usedAcc.add(a));
}
for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) usedAcc.add(s.inverseBindMatrices);
for (const an of j.animations) for (const s of an.samplers) { usedAcc.add(s.input); usedAcc.add(s.output); }
const accList = [...usedAcc].sort((a, b) => a - b);
const accMap = new Map(accList.map((a, i) => [a, i]));
const newAcc = accList.map((a) => j.accessors[a]);
// vues encore utilisées (accesseurs + images)
const usedBv = new Set(newAcc.map((a) => a.bufferView));
for (const im of j.images || []) if (im.bufferView !== undefined) usedBv.add(im.bufferView);
const bvList = [...usedBv].sort((a, b) => a - b);
const bvMap = new Map(bvList.map((b, i) => [b, i]));

// réindexation
for (const m of j.meshes || []) for (const p of m.primitives) {
  for (const k of Object.keys(p.attributes)) p.attributes[k] = accMap.get(p.attributes[k]);
  if (p.indices !== undefined) p.indices = accMap.get(p.indices);
  for (const t of p.targets || []) for (const k of Object.keys(t)) t[k] = accMap.get(t[k]);
}
for (const s of j.skins || []) if (s.inverseBindMatrices !== undefined) s.inverseBindMatrices = accMap.get(s.inverseBindMatrices);
for (const an of j.animations) for (const s of an.samplers) { s.input = accMap.get(s.input); s.output = accMap.get(s.output); }
newAcc.forEach((a) => { a.bufferView = bvMap.get(a.bufferView); });
for (const im of j.images || []) if (im.bufferView !== undefined) im.bufferView = bvMap.get(im.bufferView);
j.accessors = newAcc;

// reconstruction du tampon binaire : on copie les octets compressés de chaque vue conservée
const chunks = [];
let binOff = 0, fbOff = 0;
const align4 = (n) => (n + 3) & ~3;
const newBv = bvList.map((b) => {
  const v = structuredClone(j.bufferViews[b]);
  const ext = v.extensions?.EXT_meshopt_compression;
  const src = ext ? { off: ext.byteOffset, len: ext.byteLength } : { off: v.byteOffset || 0, len: v.byteLength };
  const data = bin.subarray(src.off, src.off + src.len);
  chunks.push(data, Buffer.alloc(align4(data.length) - data.length));
  if (ext) {
    ext.byteOffset = binOff;
    v.byteOffset = fbOff;                       // vue de repli (non compressée) : simples repères, jamais lue
    fbOff += align4(v.byteLength);
  } else {
    v.byteOffset = binOff;
  }
  binOff += align4(data.length);
  return v;
});
j.bufferViews = newBv;
j.buffers[0].byteLength = binOff;
if (j.buffers[1]) j.buffers[1].byteLength = fbOff;
const newBin = Buffer.concat(chunks);

const jsonBuf = Buffer.from(JSON.stringify(j), 'utf8');
const jsonPad = Buffer.alloc(align4(jsonBuf.length) - jsonBuf.length, 0x20);
const total = 12 + 8 + jsonBuf.length + jsonPad.length + 8 + newBin.length;
const head = Buffer.alloc(12); head.write('glTF', 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(total, 8);
const h1 = Buffer.alloc(8); h1.writeUInt32LE(jsonBuf.length + jsonPad.length, 0); h1.write('JSON', 4);
const h2 = Buffer.alloc(8); h2.writeUInt32LE(newBin.length, 0); h2.writeUInt32LE(0x004e4942, 4);
writeFileSync(fOut, Buffer.concat([head, h1, jsonBuf, jsonPad, h2, newBin]));
console.log(`écrit: ${fOut} | ${(total / 1e6).toFixed(2)} Mo (JSON ${(jsonBuf.length / 1e6).toFixed(2)} Mo)`);
