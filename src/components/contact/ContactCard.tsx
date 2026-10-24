import { Link } from "react-router";
import { contact, site } from "../../content/site";
import { ContactIcon } from "./ContactIcon";
import { CopyEmailButton } from "./CopyEmailButton";
import { contactLinks, contactNav, resumeNav } from "./links";

// UI mechanics only. Copy in Tuan's voice comes from src/content/site.ts.
const copy = {
  divider: "or",
  newTab: "(opens in a new tab)",
};

export function ContactCard() {
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="border-2 border-ink bg-card p-6 shadow-block-lg sm:p-8">
        <h1 className="font-display text-outline text-5xl tracking-tight uppercase">
          {contactNav.label}
        </h1>
        <p className="prompt mt-3 text-sm">{contact.prompt}</p>

        <div className="mt-8">
          <CopyEmailButton email={site.email} />
        </div>

        <div className="my-6 flex items-center gap-3" aria-hidden="true">
          <span className="h-0.5 flex-1 bg-ink" />
          <span className="label-mono text-ink-muted">{copy.divider}</span>
          <span className="h-0.5 flex-1 bg-ink" />
        </div>

        <ul className="space-y-3">
          {contactLinks.map((s) => {
            const external = s.href.startsWith("http");
            return (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="relative flex w-full items-center justify-center border-2 border-ink bg-card px-4 py-3 font-sans text-sm font-semibold shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
                  {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  <span className="absolute left-4">
                    <ContactIcon kind={s.kind} />
                  </span>
                  {s.label}
                  {external && <span className="sr-only"> {copy.newTab}</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-8 text-center text-sm">
        {contact.resumeLead}{" "}
        <Link
          to={resumeNav.href}
          className="font-semibold underline decoration-2 underline-offset-4 hover:text-poly"
        >
          {resumeNav.label} →
        </Link>
      </p>
    </div>
  );
}
