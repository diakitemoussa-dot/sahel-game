// Usage : node tests/inspect_anims.mjs assets/player.glb  -> durée et nombre de canaux/images par animation
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const json = JSON.parse(buf.slice(20, 20 + buf.readUInt32LE(12)).toString('utf8'));
const rows = json.animations.map((a) => {
  const s = a.samplers[0];
  const acc = json.accessors[s.input];
  return { nom: a.name, canaux: a.channels.length, images: acc.count, duree: +(acc.max?.[0] - acc.min?.[0]).toFixed(2) };
});
rows.sort((x, y) => x.images - y.images);
console.log('nom'.padEnd(28), 'canaux', 'images', 'durée(s)');
for (const r of rows) console.log(r.nom.padEnd(28), String(r.canaux).padStart(6), String(r.images).padStart(6), String(r.duree).padStart(8));
