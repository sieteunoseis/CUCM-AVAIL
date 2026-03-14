/**
 * Parse CIDR notation and check if an IP falls within the subnet.
 */
export function ipToLong(ip: string): number {
  const parts = ip.split(".").map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export function parseCidr(cidr: string): { network: number; mask: number } | null {
  const match = cidr.match(/^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/);
  if (!match) return null;
  const bits = parseInt(match[2], 10);
  if (bits < 0 || bits > 32) return null;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const network = ipToLong(match[1]) & mask;
  return { network, mask };
}

export function ipInSubnet(ip: string, cidr: string): boolean {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const ipLong = ipToLong(ip);
  return (ipLong & parsed.mask) === parsed.network;
}

export interface SubnetRow {
  id: number;
  cidr: string;
  name: string;
  description: string;
}

/**
 * Given an IP and a list of subnets, return the matching subnet (most specific / longest prefix).
 */
export function matchSubnet(ip: string, subnets: SubnetRow[]): SubnetRow | null {
  if (!ip) return null;
  let bestMatch: SubnetRow | null = null;
  let bestBits = -1;

  for (const s of subnets) {
    const match = s.cidr.match(/\/(\d+)$/);
    const bits = match ? parseInt(match[1], 10) : 0;
    if (ipInSubnet(ip, s.cidr) && bits > bestBits) {
      bestMatch = s;
      bestBits = bits;
    }
  }
  return bestMatch;
}
