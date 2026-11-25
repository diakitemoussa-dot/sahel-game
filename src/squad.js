// Coordination d'une équipe de PNJ (logique pure, testée sans navigateur) : qui couvre, qui contourne, et par quel côté.
// Les PNJ d'un même camp qui combattent le même adversaire à moins de 45 m les uns des autres forment un groupe.
// Dans un groupe de deux ou plus : le plus proche de l'adversaire (et le plus brave) COUVRE par son tir, les autres CONTOURNENT chacun par un côté
// différent pour le prendre en tenaille. Les rôles sont stables (on ne les change que si le groupe change) pour éviter les hésitations.
// Coordonnées du plan (x, z) de three.js.

const GROUP_R = 45;

/** members : [{ id, x, z, courage, teamwork }] (tous en combat), threat : { x, z }, previous : rôles précédents { id: { role, side } }.
 *  Renvoie { id: { role: 'suppress' | 'flank' | 'solo', side: -1 | 1 | 0, size } }. */
export function assignRoles(members, threat, previous = {}) {
  const out = {};
  const left = new Set(members.map((m) => m.id));
  while (left.size) {
    const first = members.find((m) => left.has(m.id));
    const group = [first]; left.delete(first.id);
    for (let i = 0; i < group.length; i++) {                      // groupe connexe : voisins de voisins
      for (const m of members) if (left.has(m.id) && Math.hypot(m.x - group[i].x, m.z - group[i].z) < GROUP_R) { group.push(m); left.delete(m.id); }
    }
    if (group.length === 1) { out[group[0].id] = { role: 'solo', side: 0, size: 1 }; continue; }
    const same = group.every((m) => previous[m.id] && previous[m.id].size === group.length);       // même groupe qu'avant : on garde les rôles
    if (same) { for (const m of group) out[m.id] = previous[m.id]; continue; }
    const dist = (m) => Math.hypot(m.x - threat.x, m.z - threat.z);
    // celui qui couvre : le plus proche, à courage égal (un peu de courage compte plus que quelques mètres)
    const rank = [...group].sort((a, b) => (dist(a) - a.courage * 8) - (dist(b) - b.courage * 8));
    const cover = rank[0];
    out[cover.id] = { role: 'suppress', side: 0, size: group.length };
    const flankers = rank.slice(1);
    // chacun part du côté où il se trouve déjà ; si tous sont du même côté, on alterne pour faire une tenaille
    const axisX = threat.x - cover.x, axisZ = threat.z - cover.z;
    const sideOf = (m) => (((m.x - cover.x) * axisZ - (m.z - cover.z) * axisX) >= 0 ? 1 : -1);
    const used = { '-1': 0, '1': 0 };
    for (const m of flankers) {
      let side = sideOf(m);
      if (used[side] > used[-side]) side = -side;
      used[side]++;
      out[m.id] = { role: 'flank', side, size: group.length };
    }
  }
  return out;
}

/** Point de contournement : sur un arc autour de l'adversaire, `side` (-1 gauche, 1 droite) de l'axe PNJ -> adversaire, à `angle` radians de cet axe,
 *  à une distance égale à `ratio` de la distance actuelle (au moins `minD`). Renvoie { x, z }. */
export function flankPoint(pos, threat, side, angle = 1.1, ratio = 0.85, minD = 8) {
  const dx = pos.x - threat.x, dz = pos.z - threat.z, d = Math.max(minD, Math.hypot(dx, dz) * ratio);
  const a = Math.atan2(dx, dz) + side * angle;                 // cap depuis l'adversaire vers le PNJ, tourné de `angle`
  return { x: threat.x + Math.sin(a) * d, z: threat.z + Math.cos(a) * d };
}

/** Candidats de contournement, du plus large au plus serré, à essayer dans l'ordre jusqu'à en trouver un praticable. */
export function flankCandidates(pos, threat, side) {
  const out = [];
  for (const angle of [1.15, 0.9, 0.65, 1.4]) for (const ratio of [0.85, 0.7, 1.0]) out.push(flankPoint(pos, threat, side, angle, ratio));
  return out;
}
