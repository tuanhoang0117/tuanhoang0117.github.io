import type { SpriteDef } from "../types";
import { costumedSprites } from "./costumes";
import { horseTrot } from "./horse-trot";
import { mustyIdle } from "./musty-idle";

export { costumedSprites, horseTrot, mustyIdle };

/** Every sprite in the site. /lab renders this list and the registry test validates it. */
export const sprites: readonly SpriteDef[] = [mustyIdle, horseTrot, ...costumedSprites];
