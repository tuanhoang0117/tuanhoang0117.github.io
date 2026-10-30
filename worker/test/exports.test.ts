import { DurableObject } from "cloudflare:workers";
import { expect, it } from "vitest";
import * as main from "../src/index";

// workerd treats every export of the main module as an entrypoint and refuses to start the Worker
// if one is a plain value (found with `wrangler dev`; the test pool does not enforce it).
it("exports only the fetch handler and Durable Object classes from the main module", () => {
  for (const [name, value] of Object.entries(main as Record<string, unknown>)) {
    if (name === "default") {
      expect(typeof (value as { fetch?: unknown }).fetch, name).toBe("function");
    } else {
      expect(typeof value, name).toBe("function");
      expect((value as { prototype: unknown }).prototype, name).toBeInstanceOf(DurableObject);
    }
  }
});
