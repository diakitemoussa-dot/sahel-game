// Menu du jeu : logique pure (testée sans navigateur). Écrans et enchaînements, réglages du joueur et leur mémorisation.
//  splash   : écran d'accueil « cliquez pour commencer » (le navigateur exige un geste pour lancer la vidéo avec le son) ;
//  intro    : la vidéo d'introduction (on peut la passer) ;
//  main     : menu principal ; options, credits : panneaux, on revient à l'écran d'où l'on vient ;
//  tenues   : le choix de la tenue (ouvert depuis le menu principal ou la pause) ;
//  playing  : en jeu ; pause : le jeu est figé (Échap).

export const SCREENS = ['splash', 'intro', 'main', 'options', 'credits', 'tenues', 'playing', 'pause'];

// écrans qui laissent voir la scène 3D derrière eux (le monde tourne ou reste figé) et écrans « en jeu »
export const MENU_SCREENS = new Set(['splash', 'intro', 'main', 'options', 'credits', 'tenues', 'pause']);

export class MenuFlow {
  /** start : écran de départ (« splash », ou « playing » en test automatique) ; loaded : le monde est-il chargé ? */
  constructor(start = 'splash') {
    this.state = start; this.stack = []; this.loaded = false; this.introSeen = false;
  }
  get active() { return this.state !== 'playing'; }
  get frozen() { return this.state === 'pause'; }                // le temps du jeu est arrêté (la pause), sinon le monde vit derrière le menu
  get showsMenu() { return MENU_SCREENS.has(this.state); }

  setLoaded() { this.loaded = true; }

  /** Va à un écran ; les panneaux (options, crédits, tenues) mémorisent d'où l'on vient pour y revenir. */
  go(screen) {
    if (!SCREENS.includes(screen)) throw new Error(`écran inconnu : ${screen}`);
    if (['options', 'credits', 'tenues'].includes(screen) && ['main', 'pause'].includes(this.state)) this.stack.push(this.state);
    else if (!['options', 'credits', 'tenues'].includes(screen)) this.stack = [];
    this.state = screen;
    return this.state;
  }
  /** Retour (Échap) : un panneau revient d'où il vient ; l'intro passe au menu ; la pause reprend le jeu ; le menu principal ne bouge pas. */
  back() {
    if (['options', 'credits', 'tenues'].includes(this.state)) return this.go(this.stack.pop() ?? 'main');
    if (this.state === 'intro') return this.skipIntro();
    if (this.state === 'pause') return this.go('playing');
    return this.state;
  }
  /** Clic sur l'écran d'accueil : lance l'intro (ignoré tant que le monde n'est pas chargé). */
  start() {
    if (this.state !== 'splash' || !this.loaded) return false;
    this.go('intro'); return true;
  }
  skipIntro() { this.introSeen = true; return this.go('main'); }
  /** JOUER : seulement depuis le menu principal (le monde doit être chargé). */
  play() {
    if (this.state !== 'main' || !this.loaded) return false;
    this.go('playing'); return true;
  }
  /** Échap en jeu (la souris est libérée par le navigateur) : pause. */
  pause() {
    if (this.state !== 'playing') return false;
    this.go('pause'); return true;
  }
  resume() { if (this.state === 'pause') { this.go('playing'); return true; } return false; }
  /** « Quitter » depuis la pause : retour au menu principal. */
  quitToMenu() { if (this.state === 'pause') { this.go('main'); return true; } return false; }
}

/** Le joueur quitte la fenêtre (autre onglet, autre application) : le jeu se met en pause et le son se coupe ; à son retour tout repart seul.
 *  On ne reprend automatiquement que la pause qu'on a mise nous-mêmes : une pause choisie par le joueur reste en pause. */
export class AwayGuard {
  constructor() { this.auto = false; }
  /** Appelé quand la fenêtre est quittée. Renvoie 'pause' si le jeu en cours doit être mis en pause. */
  leave(state) {
    if (state === 'playing') { this.auto = true; return 'pause'; }
    return null;
  }
  /** La souris a été libérée par le navigateur parce que la fenêtre a perdu le focus : cette pause-là aussi est automatique. */
  lockLostWhileAway() { this.auto = true; }
  /** Appelé au retour dans la fenêtre. Renvoie 'resume' si le jeu doit reprendre. */
  returned(state) {
    const resume = this.auto && state === 'pause';
    this.auto = false;
    return resume ? 'resume' : null;
  }
}

// ---------------------------------------------------------------------------------------------- réglages
export const QUALITES = { basse: 0.6, normale: 1.0, haute: 1.5 };          // facteur de résolution de l'image
const KEY = 'sahel.options';

export function defaultOptions() {
  return { volume: 80, qualite: 'normale', perf: 'auto', radar: true, aide: true, sang: true };
}

/** Réglages sûrs : valeurs absentes, mal typées ou hors limites remplacées par le défaut ou ramenées dans les limites. */
export function sanitizeOptions(o) {
  const d = defaultOptions();
  const r = { ...d };
  if (o && typeof o === 'object') {
    const v = Number(o.volume);
    if (Number.isFinite(v)) r.volume = Math.min(100, Math.max(0, Math.round(v)));
    if (typeof o.qualite === 'string' && o.qualite in QUALITES) r.qualite = o.qualite;
    if (['auto', 'eco', 'max'].includes(o.perf)) r.perf = o.perf;                  // performances : Auto (selon l'appareil), Économie (mode téléphone), Maximum
    for (const k of ['radar', 'aide', 'sang']) if (typeof o[k] === 'boolean') r[k] = o[k];
  }
  return r;
}

export function loadOptions(storage) {
  try { return sanitizeOptions(JSON.parse(storage?.getItem(KEY) ?? 'null')); } catch { return defaultOptions(); }
}
export function saveOptions(storage, o) {
  try { storage?.setItem(KEY, JSON.stringify(sanitizeOptions(o))); } catch { /* navigation privée : pas de mémorisation */ }
}

/** Volume (0..1) du son de la vidéo selon le réglage en pourcentage. */
export const volumeOf = (o) => sanitizeOptions(o).volume / 100;
/** Facteur de résolution de l'image selon la qualité (multiplié par le rapport de pixels de l'écran, borné à 2 et au plafond du profil de performance). */
export const pixelRatioFor = (o, dpr = 1, cap = 2) => Math.min(cap, 2, Math.max(0.5, Math.min(dpr, 2) * QUALITES[sanitizeOptions(o).qualite]));
