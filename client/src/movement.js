/** Le personnage peut-il se déplacer à cet instant ?
 *  - jamais pendant une action (recharge, mêlée, geste, coup reçu), ni à terre, ni mort ;
 *  - jamais quand il tire debout (il s'arrête pour tirer) ;
 *  - accroupi, il peut se déplacer en marchant, même en tirant ;
 *  - en l'air, le tir ne le fige pas. */
export function canMove({ dead, downed, overlay, shooting, crouch, onGround }) {
  if (dead || downed || overlay) return false;
  if (shooting && !crouch && onGround) return false;
  return true;
}
