import { describe, expect, it } from "vitest";
import { clientKey } from "../src/client";
import { BUCKET_CAPACITY } from "../src/limits";
import { increment } from "./helpers";

describe("clientKey", () => {
  it("keeps an IPv4 address whole", () => {
    expect(clientKey("203.0.113.9")).toBe("203.0.113.9");
    expect(clientKey("203.0.113.10")).not.toBe(clientKey("203.0.113.9"));
  });

  it.each([
    ["2001:db8:aa:1::1", "2001:db8:aa:1::/64"],
    ["2001:db8:aa:1:ffff:ffff:ffff:ffff", "2001:db8:aa:1::/64"],
    ["2001:0DB8:00AA:0001:0:0:0:1", "2001:db8:aa:1::/64"],
    ["2001:db8::1", "2001:db8:0:0::/64"],
    ["::1", "0:0:0:0::/64"],
    ["fe80::", "fe80:0:0:0::/64"],
  ])("reduces %s to its /64", (ip, key) => {
    expect(clientKey(ip)).toBe(key);
  });

  it("treats different /64s as different clients", () => {
    expect(clientKey("2001:db8:aa:1::1")).not.toBe(clientKey("2001:db8:aa:2::1"));
  });
});

describe("IPv6 rate limit", () => {
  it("shares one bucket across a /64", async () => {
    for (let i = 1; i <= BUCKET_CAPACITY; i += 1) {
      const ok = await increment(1, { ip: `2001:db8:bb:1::${i}` });
      expect(ok.status).toBe(200);
      await ok.json();
    }
    const sameNetwork = await increment(1, { ip: "2001:db8:bb:1::ffff" });
    expect(sameNetwork.status).toBe(429);
    await sameNetwork.json();

    const otherNetwork = await increment(1, { ip: "2001:db8:bb:2::1" });
    expect(otherNetwork.status).toBe(200);
    await otherNetwork.json();
  });
});
