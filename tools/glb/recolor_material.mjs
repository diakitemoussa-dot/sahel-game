// Crée une variante de couleur d'une tenue .glb : un matériau reçoit une couleur unie (la texture est détachée), le reste ne change pas.
// Seul le bloc JSON du fichier est réécrit ; la géométrie et les autres textures restent identiques.
// Usage : node recolor_material.mjs <entrée.glb> <sortie.glb> <nom du matériau> <couleur RRGGBB (sRGB)>
import fs from 'node:fs';

const [inp, out, matName, hex] = process.argv.slice(2);
if (!inp || !out || !matName || !/^[0-9a-fA-F]{6}$/.test(hex ?? '')) { console.error('usage : node recolor_material.mjs <entrée.glb> <sortie.glb> <matériau> <RRGGBB>'); process.exit(1); }
const buf = fs.readFileSync(inp);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('pas un fichier glb');
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const lin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const rgb = [0, 2, 4].map((i) => lin(parseInt(hex.slice(i, i + 2), 16)));
const mats = (json.materials ?? []).filter((m) => m.name === matName);
if (!mats.length) throw new Error(`matériau « ${matName} » introuvable (présents : ${(json.materials ?? []).map((m) => m.name).join(', ')})`);
for (const m of mats) {
  m.pbrMetallicRoughness = { ...m.pbrMetallicRoughness, baseColorFactor: [...rgb, 1] };
  delete m.pbrMetallicRoughness.baseColorTexture;
  delete m.normalTexture;                                              // le relief du tissu va avec sa texture
}
let js = Buffer.from(JSON.stringify(json), 'utf8');
js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);   // le bloc JSON est complété d'espaces jusqu'à un multiple de 4
const rest = buf.subarray(20 + jsonLen);
const head = Buffer.alloc(20);
buf.copy(head, 0, 0, 20);
head.writeUInt32LE(js.length, 12);
const all = Buffer.concat([head, js, rest]);
all.writeUInt32LE(all.length, 8);
fs.writeFileSync(out, all);
console.log(`${out} : ${mats.length} matériau « ${matName} » en #${hex.toUpperCase()}, ${(all.length / 1e6).toFixed(2)} Mo`);
