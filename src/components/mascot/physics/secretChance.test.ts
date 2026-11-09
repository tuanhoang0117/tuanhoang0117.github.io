import { describe, expect, it } from "vitest";
import { isSecretSpawn, SECRET_ODDS } from "./secretChance";

describe("isSecretSpawn", () => {
  it("is a 1 in 50 chance", () => {
    expect(SECRET_ODDS).toBe(50);
  });

  it("is true exactly for rolls below 1/50", () => {
    expect(isSecretSpawn(() => 0)).toBe(true);
    expect(isSecretSpawn(() => 0.0199)).toBe(true);
    expect(isSecretSpawn(() => 0.02)).toBe(false);
    expect(isSecretSpawn(() => 0.5)).toBe(false);
    expect(isSecretSpawn(() => 0.9999)).toBe(false);
  });

  it("hits once per 50 evenly spread rolls", () => {
    const rolls = Array.from({ length: 5000 }, (_, i) => (i + 0.5) / 5000);
    const hits = rolls.filter((roll) => isSecretSpawn(() => roll)).length;
    expect(hits).toBe(100);
  });

  it("defaults to Math.random", () => {
    const original = Math.random;
    try {
      Math.random = () => 0.01;
      expect(isSecretSpawn()).toBe(true);
      Math.random = () => 0.99;
      expect(isSecretSpawn()).toBe(false);
    } finally {
      Math.random = original;
    }
  });
});
