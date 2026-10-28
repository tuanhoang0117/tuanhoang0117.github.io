import { useState } from "react";
import { Mascot, type MascotActivation } from "../../components/mascot/Mascot";
import { PageHeader } from "../../components/ui/PageHeader";

// Test bench for the glyph mascot (issue #23). It logs every onActivate call so the e2e tests and
// a person checking by eye can see what physics and the counter will receive. Not linked from
// the nav.
export function MascotLab() {
  const [calls, setCalls] = useState(0);
  const [last, setLast] = useState<MascotActivation | null>(null);

  const record = (activation: MascotActivation) => {
    setCalls((n) => n + 1);
    setLast(activation);
  };

  return (
    <>
      <PageHeader title="Mascot Lab" />
      <div className="mx-auto max-w-6xl px-4 pb-16 sm:px-8">
        <div className="mx-auto max-w-xl">
          <Mascot onActivate={record} />
        </div>
        <dl className="mx-auto mt-8 flex max-w-xl flex-wrap gap-x-8 gap-y-2 border-2 border-ink bg-card p-4 shadow-block">
          <div>
            <dt className="label-mono text-ink-muted">onActivate calls</dt>
            <dd className="font-mono text-sm" data-testid="mascot-calls">
              {calls}
            </dd>
          </div>
          <div>
            <dt className="label-mono text-ink-muted">Last input</dt>
            <dd className="font-mono text-sm" data-testid="mascot-last">
              {last ? `${last.input} @ ${Math.round(last.x)}, ${Math.round(last.y)}` : "none"}
            </dd>
          </div>
        </dl>
      </div>
    </>
  );
}
