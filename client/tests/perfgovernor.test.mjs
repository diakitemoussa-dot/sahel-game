import test from 'node:test';
import assert from 'node:assert/strict';
import { PerfGovernor, QUALITY_LEVELS } from '../src/perfgovernor.js';

/** Fait tourner le gouverneur pendant `seconds` s. ms : durée d'image fixe, ou fonction (palier) => durée (un ordinateur dont l'image coûte plus ou moins selon la qualité).
 *  Renvoie les changements de palier [{ t, level }]. */
function run(g, ms, seconds) {
  if (!g._warmed) { for (let w = 0; w < 6 / 0.016; w++) g.push(0.016); g._warmed = true; }      // temps de chauffe (6 s) passé à 60 images/s
  const out = []; let t = 0;
  while (t < seconds) { const d = (typeof ms === 'function' ? ms(g.level) : ms) / 1000; const lv = g.push(d); t += d; if (lv !== null) out.push({ t: +t.toFixed(1), level: lv }); }
  return out;
}
/** Un ordinateur dont la lenteur vient de l'image : durée = part processeur + part image qui baisse avec la résolution (au carré). */
const gpuBound = (cpu, gpu) => (level) => cpu + gpu * QUALITY_LEVELS[level].scale ** 2;

test('paliers : la résolution baisse, puis les ombres s’affinent moins, puis disparaissent', () => {
  assert.equal(QUALITY_LEVELS[0].scale, 1); assert.equal(QUALITY_LEVELS[0].shadow, 1);
  for (let i = 1; i < QUALITY_LEVELS.length; i++) {
    assert.ok(QUALITY_LEVELS[i].scale < QUALITY_LEVELS[i - 1].scale);
    assert.ok(QUALITY_LEVELS[i].shadow <= QUALITY_LEVELS[i - 1].shadow);
  }
  assert.equal(QUALITY_LEVELS.at(-1).shadow, 0);
});

test('fluide (60 images/s) : rien ne change', () => {
  const g = new PerfGovernor();
  assert.deepEqual(run(g, 16.6, 120), []);
  assert.equal(g.level, 0);
});

test('trop lent à cause de l’image : la qualité baisse par paliers espacés, jusqu’à s’arrêter au dernier palier', () => {
  const g = new PerfGovernor();
  const ch = run(g, gpuBound(4, 60), 120);                  // 64 ms au maximum, 22 ms au dernier palier : toujours lent, mais chaque baisse aide
  assert.deepEqual(ch.map((c) => c.level), [1, 2, 3]);
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i].t - ch[i - 1].t >= 4, 'délai entre deux baisses');
  assert.equal(g.level, 3, 'jamais plus bas que le dernier palier');
});

test('une machine qui retrouve de la fluidité après une baisse ne descend pas plus bas', () => {
  const g = new PerfGovernor();
  const model = gpuBound(4, 21);                           // 25 ms au maximum (lent), 19 ms au palier 1 (fluide)
  run(g, model, 5);
  const lvl = g.level; assert.equal(lvl, 1);
  run(g, model, 30);
  assert.equal(g.level, lvl, 'pas de baisse supplémentaire');
});

test('avec de la marge pendant longtemps, il remonte d’un cran ; si c’est trop lent juste après, il redescend et les remontées sont bloquées', () => {
  const g = new PerfGovernor();
  const model = gpuBound(4, 26);                           // 30 ms (palier 0), 22,8 ms (1), 16,7 ms (2, fluide avec de la marge)
  run(g, model, 40);
  assert.equal(g.level, 2, 'il s’installe au palier fluide');
  let t = 0; while (g.level === 2 && t < 300) { const lv = g.push(model(2) / 1000); t += model(2) / 1000; if (lv !== null) break; }
  assert.equal(g.level, 1, 'remonte d’un cran après une longue marge');
  run(g, model, 12);                                       // l'essai est raté (22,8 ms au palier 1) : il redescend
  assert.equal(g.level, 2);
  run(g, model, 150);                                      // même avec de la marge : remontées bloquées 3 minutes
  assert.equal(g.level, 2);
});

test('les images très longues (onglet caché, pause) sont ignorées et ne déclenchent rien', () => {
  const g = new PerfGovernor();
  for (let i = 0; i < 50; i++) assert.equal(g.push(2.5), null);
  for (let i = 0; i < 100; i++) g.push(0.0166);
  assert.equal(g.level, 0);
});

test('un pic isolé ne suffit pas : c’est la médiane de la fenêtre qui compte', () => {
  const g = new PerfGovernor();
  const ch = [];
  for (let k = 0; k < 200; k++) { const lv = g.push(k % 20 === 0 ? 0.2 : 0.0166); if (lv !== null) ch.push(lv); }
  assert.deepEqual(ch, []);
});

test('les premières secondes (chargement) sont ignorées même si les images sont très lentes', () => {
  const g = new PerfGovernor();
  let changed = null;
  for (let i = 0; i < 5.5 / 0.1; i++) { const lv = g.push(0.1); if (lv !== null) changed = lv; }          // 10 images/s pendant 5,5 s
  assert.equal(changed, null); assert.equal(g.level, 0);
});

test('ralentissement dû au processeur : la baisse ne sert à rien, il la défait et arrête de dégrader', () => {
  const g = new PerfGovernor();
  const ch = run(g, gpuBound(26, 3), 240);                 // 29 ms par image quoi qu'on fasse
  assert.equal(g.level, 0, 'la qualité est restée au maximum');
  assert.ok(ch.length <= 4, `peu de changements (${ch.map((c) => c.level).join(',')})`);
});

test('ralentissement dû à l’image : la qualité baisse jusqu’à ce que ce soit fluide, et pas plus bas', () => {
  const g = new PerfGovernor();
  run(g, gpuBound(4, 28), 240);                            // 32 ms au maximum ; 17,7 ms au palier 2
  assert.ok(g.level >= 1 && g.level <= 2, `palier ${g.level}`);
  assert.ok(gpuBound(4, 28)(g.level) <= 24.5);
});
