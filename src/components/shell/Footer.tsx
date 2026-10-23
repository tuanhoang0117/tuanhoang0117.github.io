import { useEffect, useState } from "react";
import { site, socials } from "../../content/site";
import { formatLocalTime } from "../../lib/time";

function LocalTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  return <time dateTime={now.toISOString()}>{formatLocalTime(now, site.timeZone)}</time>;
}

export function Footer() {
  return (
    <footer className="border-t-2 border-ink bg-paper-deep">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
        <p className="font-display text-outline text-5xl leading-none tracking-tight sm:text-7xl lowercase">
          {site.name}
        </p>

        <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <dl className="label-mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-ink-muted">
            <dt className="sr-only">Location</dt>
            <dd className="col-span-2">{site.location}</dd>
            <dt className="sr-only">Local time</dt>
            <dd className="col-span-2">
              <LocalTime />
            </dd>
          </dl>

          <ul className="flex flex-wrap gap-4">
            {socials.map((s) => (
              <li key={s.href}>
                <a
                  href={s.href}
                  className="label-mono underline decoration-2 underline-offset-4 hover:text-poly"
                  {...(s.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
