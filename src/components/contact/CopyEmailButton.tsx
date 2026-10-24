import { useEffect, useRef, useState } from "react";

/** How long the "Copied!" confirmation stays before the button resets. */
export const COPIED_MS = 2000;

const labels = {
  idle: "Copy email",
  copied: "Copied!",
  failed: "Couldn't copy. Select it below",
};

const announcements = {
  idle: "",
  copied: "Email address copied to clipboard.",
  failed: "Couldn't copy automatically. The email address is shown below the button.",
};

type Status = keyof typeof labels;

interface CopyEmailButtonProps {
  email: string;
}

export function CopyEmailButton({ email }: CopyEmailButtonProps) {
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    clearTimeout(timer.current);
    try {
      // Missing in insecure contexts and some browsers; treat that the same as a rejection.
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(email);
      setStatus("copied");
      timer.current = setTimeout(() => setStatus("idle"), COPIED_MS);
    } catch {
      setStatus("failed");
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={copy}
        className="block w-full border-2 border-ink bg-gold-bright px-4 py-3 font-mono text-sm font-bold shadow-block-sm transition-transform hover:-translate-x-0.5 hover:-translate-y-0.5"
      >
        {labels[status]}
      </button>
      <p role="status" aria-live="polite" className="sr-only">
        {announcements[status]}
      </p>
      {status === "failed" && (
        <p className="mt-3 border-2 border-dashed border-ink bg-paper px-3 py-2 text-center font-mono text-sm break-all select-all">
          {email}
        </p>
      )}
    </div>
  );
}
