import { Link, NavLink } from "react-router";
import { navLinks } from "../../content/site";

export function Nav() {
  return (
    <header className="border-b-2 border-ink bg-paper">
      <nav
        aria-label="Main"
        className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8"
      >
        <Link
          to="/"
          className="border-2 border-ink bg-card px-2 py-1 font-pixel text-sm shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          [tuan]
        </Link>
        <ul className="flex flex-wrap items-center gap-1 sm:gap-2">
          {navLinks.map((link) => (
            <li key={link.href}>
              <NavLink
                to={link.href}
                className={({ isActive }) =>
                  [
                    "label-mono block border-2 px-3 py-1.5",
                    isActive
                      ? "border-ink bg-ink text-paper"
                      : "border-transparent hover:border-ink",
                  ].join(" ")
                }
              >
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
