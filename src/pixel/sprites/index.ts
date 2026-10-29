import type { SpriteDef } from "../types";
import { horseTrot } from "./horse-trot";
import { mustyIdle } from "./musty-idle";

export { horseTrot, mustyIdle };

/** Every sprite in the site. /lab renders this list and the registry test validates it. */
export const sprites: readonly SpriteDef[] = [mustyIdle, horseTrot];
