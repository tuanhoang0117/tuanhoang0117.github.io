import { Link } from "react-router";
import { homeIntro, site } from "../../content/site";
import { pageThemes } from "../../styles/themes";
import { Stagger } from "../motion/Stagger";

const theme = pageThemes.home;

/** The intro: photo, short introduction, and route into the portfolio, open on the graph paper. */
export function HomeIntro() {
  return (
    <Stagger className="grid items-center gap-8 sm:grid-cols-3 lg:gap-12 xl:gap-8">
      <img
        src="/profile.jpg"
        alt={site.name}
        width={256}
        height={256}
        className="mx-auto aspect-square w-full max-w-64 border-2 border-ink object-cover"
      />
      <div className="sm:col-span-2">
        <p className={`label-mono flex items-center gap-4 font-bold ${theme.accentText}`}>
          {homeIntro.label}
          <span aria-hidden="true" className="h-0.5 flex-1 bg-ink" />
        </p>
        <p className="mt-4 text-lg leading-relaxed sm:text-xl lg:text-2xl xl:text-xl">
          {homeIntro.body}
        </p>
        <Link
          to="/portfolio"
          className="mt-6 inline-block font-mono text-sm font-bold underline decoration-2 underline-offset-4 hover:text-poly hover:underline-offset-8"
        >
          {homeIntro.workLink}
        </Link>
      </div>
    </Stagger>
  );
}
