import type { SpriteDef } from "../../types";
import { mustyAviatorGoggles } from "./aviator-goggles";
import { mustyCowboyHat } from "./cowboy-hat";
import { mustyGraduationCap } from "./graduation-cap";
import { mustyHeadphones } from "./headphones";
import { mustyPartyHat } from "./party-hat";
import { mustyRoundGlasses } from "./round-glasses";
import { mustySafetyGoggles } from "./safety-goggles";
import { horseSportsJersey } from "./sports-jersey";
import { mustySunglasses } from "./sunglasses";
import { mustyVolleyballHeadband } from "./volleyball-headband";

export { dress, type Costume } from "./dress";
export {
  horseSportsJersey,
  mustyAviatorGoggles,
  mustyCowboyHat,
  mustyGraduationCap,
  mustyHeadphones,
  mustyPartyHat,
  mustyRoundGlasses,
  mustySafetyGoggles,
  mustySunglasses,
  mustyVolleyballHeadband,
};

/** Every costumed horse (owner request, 2026-10-29), each an ordinary SpriteDef. */
export const costumedSprites: readonly SpriteDef[] = [
  mustyCowboyHat,
  mustyAviatorGoggles,
  mustySafetyGoggles,
  mustyRoundGlasses,
  mustySunglasses,
  mustyVolleyballHeadband,
  mustyGraduationCap,
  mustyHeadphones,
  mustyPartyHat,
  horseSportsJersey,
];
