// La mission du joueur : éliminer tous les miliciens, avec ses hommes (l'escouade). Logique pure, testée sans navigateur.
//  - le compte des miliciens tombés et des hommes de l'escouade encore debout ;
//  - la victoire quand plus aucun milicien ne tient debout, avec ou sans l'escouade au complet.

export const MISSION_TITLE = 'Éliminer tous les miliciens avec votre escouade';

export class Mission {
  constructor() { this.won = false; this.squadMax = 0; }

  /** enemies : { total, dead } ; squad : { total, alive } (les hommes du joueur). Renvoie l'état à afficher. */
  update({ enemies, squad }) {
    this.squadMax = Math.max(this.squadMax, squad.total);
    const left = enemies.total - enemies.dead;
    const justWon = !this.won && enemies.total > 0 && left <= 0;
    if (justWon) this.won = true;
    const complete = squad.alive >= squad.total;
    return {
      won: this.won, justWon, left, dead: enemies.dead, total: enemies.total,
      squadAlive: squad.alive, squadTotal: squad.total, squadComplete: complete,
      text: `MISSION : ${this.won ? 'accomplie' : 'éliminer les miliciens'}\nMiliciens : ${enemies.dead} / ${enemies.total}\nEscouade : ${squad.alive} / ${squad.total}`,
      banner: justWon
        ? { title: 'MISSION ACCOMPLIE', sub: complete ? `Tous les miliciens sont neutralisés, l'escouade est au complet (${squad.alive}/${squad.total}).` : `Tous les miliciens sont neutralisés. Escouade : ${squad.alive} homme${squad.alive > 1 ? 's' : ''} sur ${squad.total}.` }
        : null,
    };
  }
}
