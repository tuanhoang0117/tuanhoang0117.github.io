import { useEffect, useState, type RefObject } from "react";

const supported = () => typeof IntersectionObserver !== "undefined";

/**
 * True while the element overlaps the viewport. Without IntersectionObserver it always reports
 * true, so sprites still animate in browsers that lack it.
 */
export function useInView(ref: RefObject<Element | null>): boolean {
  // Starts false where the observer exists: the observer reports the real state on its first call.
  const [inView, setInView] = useState(() => !supported());

  useEffect(() => {
    const el = ref.current;
    if (!el || !supported()) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setInView(entry.isIntersecting);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  return inView;
}
