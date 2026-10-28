import { Link } from "react-router";
import { homeIntro, site } from "../../content/site";
import { pageThemes, cardShadow } from "../../styles/themes";
import { cardLift } from "../motion/motion";
import { Stagger } from "../motion/Stagger";

const theme = pageThemes.home;

/** The profile card: photo, short introduction, and route into the portfolio. */
export function HomeIntro() {
  return (
    <Stagger
      className={`grid items-center gap-8 border-2 border-ink p-6 shadow-block-lg sm:grid-cols-3 sm:p-8 lg:gap-12 lg:p-10 xl:gap-8 xl:p-8 ${theme.wash} ${cardShadow(theme, 0)}`}
    >
      <img
        src="/profile.jpg"
        alt={site.name}
        width={256}
        height={256}
        className={`mx-auto aspect-square w-full max-w-64 border-2 border-ink object-cover shadow-block ${cardShadow(theme, 2)}`}
      />
      <div className="sm:col-span-2">
        <p className="text-lg leading-relaxed sm:text-xl lg:text-2xl xl:text-xl">
          {homeIntro.body}
        </p>
        <Link
          to="/portfolio"
          className={`mt-6 inline-block border-2 border-ink bg-gold-bright px-4 py-2 font-mono text-sm font-bold ${cardLift.sm}`}
        >
          {homeIntro.workLink}
        </Link>
      </div>
    </Stagger>
  );
}
