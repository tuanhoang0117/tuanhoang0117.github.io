import type { SpriteDef } from "../types";
import { mustyIdle } from "./musty-idle";

export { mustyIdle };

/** Every sprite in the site. /lab renders this list and the registry test validates it. */
export const sprites: readonly SpriteDef[] = [mustyIdle];
