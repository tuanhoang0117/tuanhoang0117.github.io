import { describe, expect, it } from "vitest";
import { formatLocalTime } from "./time";

describe("formatLocalTime", () => {
  it("formats in the requested time zone, not the machine's", () => {
    const noonUtc = new Date("2026-10-23T19:33:00Z");
    expect(formatLocalTime(noonUtc, "America/Los_Angeles")).toBe("12:33 PM");
    expect(formatLocalTime(noonUtc, "America/New_York")).toBe("3:33 PM");
  });
});
