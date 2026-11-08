import { Link } from "react-router";
import { site } from "../../content/site";
import { Sprite } from "../../pixel/Sprite";
import { mustyIdle } from "../../pixel/sprites";

/**
 * Musty in a block at the top left, the menu toggle's pair on the opposite corner: a link home.
 * It sits in the header's layer before the menu, so the open menu's dim layer and panel cover it.
 */
export function HomeLink() {
  return (
    <Link
      to="/"
      data-home-link=""
      className="fixed top-3 left-3 flex size-11 items-center justify-center border-2 border-ink bg-card shadow-block-sm sm:top-4 sm:left-4"
    >
      <Sprite sprite={mustyIdle} scale={2} />
      <span className="sr-only">{site.name}</span>
    </Link>
  );
}
