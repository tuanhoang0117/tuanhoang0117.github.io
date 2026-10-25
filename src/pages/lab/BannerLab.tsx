import { useRef, useState } from "react";
import { Banner, BANNER_SPEED, type BannerLoop } from "../../components/brand/Banner";
import { PageHeader } from "../../components/ui/PageHeader";

// Test bench for the school banner (#21). The header and facts stand in for the home page's hero:
// scroll past them and the banner fades out. The empty band below gives room to scroll.
export function BannerLab() {
  const heroRef = useRef<HTMLDivElement>(null);
  const [loop, setLoop] = useState<BannerLoop | null>(null);

  const facts: [string, string][] = loop
    ? [
        ["Orientation", loop.vertical ? "vertical" : "horizontal"],
        ["Speed", `${BANNER_SPEED} px/s`],
        ["Copy length", `${Math.round(loop.copyLength)} px`],
        ["Copies", String(loop.copies)],
        ["Loop", loop.duration > 0 ? `${(loop.duration / 1000).toFixed(1)} s` : "static"],
      ]
    : [];

  return (
    <>
      <div ref={heroRef} data-testid="banner-lab-hero">
        <PageHeader title="Banner Lab">
          <dl className="mt-6 grid max-w-md grid-cols-2 gap-x-6 gap-y-2 border-2 border-ink bg-card p-4 shadow-block-sm">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="label-mono text-ink-muted">{label}</dt>
                <dd className="font-mono text-sm" data-fact={label}>
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </PageHeader>
      </div>
      <div aria-hidden="true" className="h-dvh" />
      <Banner hideAfter={heroRef} onLoop={setLoop} />
    </>
  );
}
