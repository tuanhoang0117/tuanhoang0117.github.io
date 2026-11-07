/**
 * The rate-limit identity for a connecting IP. An IPv4 address is its own client. For IPv6 the
 * client is the /64 prefix: one home or phone connection is usually given a whole /64, so keying on
 * the full address would let a single client rotate through billions of addresses.
 */
export function clientKey(ip: string): string {
  if (!ip.includes(":") || ip.includes(".")) return ip;

  const [head, tail] = ip.toLowerCase().split("::", 2);
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = tail === undefined ? 0 : 8 - headGroups.length - tailGroups.length;
  const groups = [...headGroups, ...Array<string>(Math.max(0, zeros)).fill("0"), ...tailGroups];

  const prefix = groups.slice(0, 4).map((group) => Number.parseInt(group, 16).toString(16));
  return `${prefix.join(":")}::/64`;
}
