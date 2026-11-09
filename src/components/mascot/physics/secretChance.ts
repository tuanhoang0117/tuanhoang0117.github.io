/** One spawned token in this many, on average, is the secret sprite (issue #95). */
export const SECRET_ODDS = 50;

/**
 * Rolls for the secret sprite: true with probability 1 / SECRET_ODDS. `random` returns a number
 * in [0, 1), like Math.random (the default); tests pass a fixed one.
 */
export function isSecretSpawn(random: () => number = Math.random): boolean {
  return random() < 1 / SECRET_ODDS;
}
