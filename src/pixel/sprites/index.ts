import type { SpriteDef } from "../types";
import { costumedSprites } from "./costumes";
import { horseTrot } from "./horse-trot";
import { mustyIdle } from "./musty-idle";
import { secretUnicorn } from "./secret-unicorn";

export { costumedSprites, horseTrot, mustyIdle, secretUnicorn };

/** Every sprite in the site. /lab renders this list and the registry test validates it. */
export const sprites: readonly SpriteDef[] = [
  mustyIdle,
  horseTrot,
  secretUnicorn,
  ...costumedSprites,
];
