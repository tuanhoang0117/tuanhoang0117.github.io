import { useEffect, useState, useSyncExternalStore } from "react";
import { counterClientFromEnv, type CounterClient } from "./client";
import { SharedCounter, type CounterMode, type SharedCounterOptions } from "./sharedCounter";

export interface SharedCount {
  count: number;
  mode: CounterMode;
  press: () => void;
}

/**
 * The shared press total for one mounted counter. The client is chosen once per mount; by default
 * it's the build's (`counterClientFromEnv`).
 */
export function useSharedCounter(
  client?: CounterClient,
  options?: SharedCounterOptions,
): SharedCount {
  const [counter] = useState(() => new SharedCounter(client ?? counterClientFromEnv(), options));

  useEffect(() => {
    counter.connect();
    // A tab close or full navigation never runs React cleanup, so `pagehide` sends what's waiting.
    // A page restored from the back-forward cache picks up where it left off.
    const hide = () => counter.disconnect();
    const show = (event: PageTransitionEvent) => {
      if (event.persisted) counter.connect();
    };
    window.addEventListener("pagehide", hide);
    window.addEventListener("pageshow", show);
    return () => {
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
      counter.disconnect();
    };
  }, [counter]);

  const count = useSyncExternalStore(counter.subscribe, counter.getCount);
  const mode = useSyncExternalStore(counter.subscribe, counter.getMode);
  const [press] = useState(() => () => counter.press());
  return { count, mode, press };
}
