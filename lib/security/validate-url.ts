import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
export function unsafeAddress(address: string): boolean {
  const h=address.toLowerCase().replace(/^\[|\]$/g, "");
  if (h.includes(":")) return !/^[23][0-9a-f]{0,3}:/.test(h); // Only global-unicast IPv6; blocks mapped IPv4 too.
  const p=h.split(".").map(Number);
  return p.length!==4 || p.some(x=>!Number.isInteger(x)||x<0||x>255) || p[0]===0 || p[0]===10 || p[0]===127 || p[0]>=224 || (p[0]===169&&p[1]===254) || (p[0]===172&&p[1]>=16&&p[1]<=31) || (p[0]===192&&p[1]===168) || (p[0]===100&&p[1]>=64&&p[1]<=127) || (p[0]===198&&(p[1]===18||p[1]===19));
}
export async function validateUrl(value: string): Promise<string> {
  let url: URL;
  try {url=new URL(value);} catch {throw new Error("Invalid URL");}
  const host=url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!['http:','https:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port)) || host==='localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.' ) && !isIP(host)) throw new Error("Invalid URL");
  try {
    const addresses = isIP(host) ? [{address:host}] : await lookup(host,{all:true});
    if (!addresses.length || addresses.some(a=>unsafeAddress(a.address))) throw new Error("unsafe");
  } catch {throw new Error("Invalid URL");}
  url.hash='';return url.toString();
}
