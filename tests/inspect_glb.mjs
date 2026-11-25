// Usage : node tests/inspect_glb.mjs assets/player.glb
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + jsonLen).toString('utf8'));
const names = (json.nodes || []).map((n) => n.name);
console.log('noeuds :', names.length, '| maillages :', (json.meshes || []).length, '| peaux :', (json.skins || []).length,
  '| matériaux :', (json.materials || []).length, '| images :', (json.images || []).length);
console.log('animations :', (json.animations || []).length);
const want = ['Muzzle', 'Muzzle_Pistol', 'Weapon', 'Mag', 'Rifle', 'Rifle_Mag', 'Pistol', 'Body', 'Hoodie', 'Hair_Twists', 'mixamorig4:Spine1', 'mixamorig4:RightHand', 'mixamorig4:Head'];
const has = (k) => names.some((n) => n === k || n === k.replace(':', '') || n === k.replace(':', '_'));
console.log('noeuds clés :', want.map((k) => `${k}=${has(k) ? 'oui' : 'NON'}`).join(' | '));
if (process.argv[3] === 'noms') console.log((json.animations || []).map((a) => a.name).join(', '));
if (process.argv[3] === 'tous') console.log(names.join(', '));
