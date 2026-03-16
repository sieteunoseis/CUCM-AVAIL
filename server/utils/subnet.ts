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

/**
 * Pre-parsed subnet for fast bulk matching (avoids re-parsing CIDR per phone).
 */
export interface ParsedSubnet {
  row: SubnetRow;
  network: number;
  mask: number;
  bits: number;
}

export function parseSubnets(subnets: SubnetRow[]): ParsedSubnet[] {
  const result: ParsedSubnet[] = [];
  for (const s of subnets) {
    const parsed = parseCidr(s.cidr);
    if (!parsed) continue;
    const bitsMatch = s.cidr.match(/\/(\d+)$/);
    const bits = bitsMatch ? parseInt(bitsMatch[1], 10) : 0;
    result.push({ row: s, network: parsed.network, mask: parsed.mask, bits });
  }
  return result;
}

export function matchSubnetFast(ipLong: number, parsed: ParsedSubnet[]): SubnetRow | null {
  let bestMatch: SubnetRow | null = null;
  let bestBits = -1;
  for (const s of parsed) {
    if ((ipLong & s.mask) === s.network && s.bits > bestBits) {
      bestMatch = s.row;
      bestBits = s.bits;
    }
  }
  return bestMatch;
}
