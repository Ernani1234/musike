import { BlockList, isIP } from "node:net";
import type { FastifyRequest } from "fastify";

export function trustedProxies(spec = process.env.MUSIKE_TRUST_PROXY ?? "") {
  const list = new BlockList();
  for (const entry of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [ip, prefix] = entry.split("/"); const family = isIP(ip!);
    if (!family) throw new Error("MUSIKE_TRUST_PROXY must list explicit IP addresses or CIDR ranges");
    if (prefix === undefined) list.addAddress(ip!, family === 4 ? "ipv4" : "ipv6");
    else { const bits = Number(prefix); if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) throw new Error("Invalid trusted proxy prefix");
      list.addSubnet(ip!, bits, family === 4 ? "ipv4" : "ipv6"); }
  }
  const trust = (address: string) => { const ip = address.replace(/^::ffff:/, ""); const family = isIP(ip);
    return !!family && list.check(ip, family === 4 ? "ipv4" : "ipv6"); };
  const realIp = (req: FastifyRequest) => {
    const peer = req.socket.remoteAddress ?? req.ip;
    const cf = req.headers["cf-connecting-ip"];
    return trust(peer) && typeof cf === "string" && isIP(cf) ? cf : req.ip;
  };
  return { trust, realIp };
}
