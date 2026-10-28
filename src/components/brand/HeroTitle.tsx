import { useRef } from "react";
import { site } from "../../content/site";
import { shimmerStyle, useShimmer } from "./shimmer";

/**
 * Font size follows the screen: 60px on phones, 128px from `md` (768px). Archivo Black is wide
 * ("Tuan Hoang" is about 6.3em: 378px at 60px, 802px at 128px), so the size is fixed and the
 * layout adapts instead: see LEAD_LAYOUT.
 */
const SIZES = "text-6xl md:text-9xl";

/**
 * "Tuan" shares a line with "Hoang" only where the whole name fits. The heading's container must
 * be at least @sm (384px) wide on phones, or @4xl (896px) from `md`. Otherwise "Tuan" is a block
 * and "Hoang" drops under it.
 */
const LEAD_LAYOUT = "block @sm:max-md:inline md:@4xl:inline";

interface HeroTitleProps {
  /** The heading level. `h1` on the home page; lower where a page already has its own `h1`. */
  as?: "h1" | "h2" | "p";
}

/**
 * The site owner's name as a giant display title: the first part in solid ink, the last word with
 * a slowly drifting shimmer clipped to its letters. The shimmer is an `aria-hidden` copy laid over
 * the real word, so screen readers hear the name once. Under reduced motion it holds still.
 */
export function HeroTitle({ as: Tag = "h1" }: HeroTitleProps) {
  const split = site.name.lastIndexOf(" ");
  const lead = split === -1 ? "" : site.name.slice(0, split);
  const last = split === -1 ? site.name : site.name.slice(split + 1);

  const shimmer = useRef<HTMLSpanElement>(null);
  useShimmer(shimmer);

  return (
    // Container queries on the space the title is given choose one line or two (LEAD_LAYOUT).
    <div className="@container">
      <Tag
        className={`font-display leading-tight tracking-tight whitespace-nowrap text-ink ${SIZES}`}
      >
        {lead && (
          <>
            <span className={LEAD_LAYOUT}>{lead}</span>{" "}
          </>
        )}
        <span className="relative inline-block">
          <span>{last}</span>
          <span
            ref={shimmer}
            aria-hidden="true"
            data-shimmer=""
            className="pointer-events-none absolute inset-0 bg-clip-text text-transparent select-none mask-l-from-60%"
            style={shimmerStyle}
          >
            {last}
          </span>
        </span>
      </Tag>
    </div>
  );
}
