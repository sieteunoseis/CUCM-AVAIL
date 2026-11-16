import { ipToLong, parseCidr } from "./subnet.js";

export type CerSubnet = { cidr: string; subnetId: string; mask: string; erlName: string; location: string };
export type CerStatus = "match" | "mismatch" | "missing";

/** A CER subnet with a prefix shorter than this is "broad". */
export const BROAD_PREFIX = 22;

const arr = <T>(x: T | T[] | null | undefined): T[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = (x: unknown): string => (x == null ? "" : String(x).trim());

/** Dotted netmask -> prefix length; null unless it is a valid contiguous mask. */
export function maskToBits(mask: string): number | null {
  const m = mask.trim().match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  if (parts.some((p) => p > 255)) return null;
  const n = ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const inverted = ~n >>> 0;
  if ((inverted & (inverted + 1)) !== 0) return null; // not contiguous ones
  let bits = 0;
  for (let v = n; v & 0x80000000; v = (v << 1) >>> 0) bits++;
  return bits;
}

/** Normalize one page of GET /cerappservices/service/v1/ipsubnet (JSON). */
export function normalizeCerPage(json: any): {
  valid: boolean;
  subnets: CerSubnet[];
  skippedNontrackable: number;
  count: number;
  returned: number;
} {
  // A real page always carries subnetDetails and paging; anything else (e.g. {"status":"Access Denied"}) is not data.
  const valid = !!json && typeof json === "object" && !!json.subnetDetails && !!json.paging;
  const raw = arr<any>(json?.subnetDetails?.ipv4Subnets?.subnet);
  const subnets: CerSubnet[] = [];
  let skippedNontrackable = 0;
  for (const s of raw) {
    if (str(s?.isnontrackable).toLowerCase() === "true") {
      skippedNontrackable++;
      continue;
    }
    const subnetId = str(s?.subnetID);
    const mask = str(s?.subnetMask);
    const bits = maskToBits(mask);
    if (bits === null || !/^\d+\.\d+\.\d+\.\d+$/.test(subnetId)) continue;
    const parsed = parseCidr(`${subnetId}/${bits}`);
    if (!parsed) continue;
    const network = [24, 16, 8, 0].map((sh) => (parsed.network >>> sh) & 255).join(".");
    subnets.push({ cidr: `${network}/${bits}`, subnetId, mask, erlName: str(s?.erlName), location: str(s?.location) });
  }
  const count = parseInt(str(json?.paging?.count), 10);
  return { valid, subnets, skippedNontrackable, count: Number.isFinite(count) ? count : raw.length, returned: raw.length };
}

/**
 * Read every page via fetchPage(offset). Throws (so callers keep old data) when a page
 * is not real data, when paging ends before `count`, or when CER suddenly reports 0
 * subnets although the last good sync had some.
 */
export async function pageThrough(
  fetchPage: (offset: number) => Promise<any>,
  pageSize: number,
  previousCount = 0,
): Promise<{ subnets: CerSubnet[]; skippedNontrackable: number }> {
  const subnets: CerSubnet[] = [];
  let skippedNontrackable = 0;
  let offset = 0;
  let count = 0;
  for (let guard = 0; guard < 200; guard++) {
    const page = normalizeCerPage(await fetchPage(offset));
    if (!page.valid) throw new Error("CER returned an unexpected response (no subnetDetails/paging)");
    count = page.count;
    subnets.push(...page.subnets);
    skippedNontrackable += page.skippedNontrackable;
    offset += page.returned;
    if (page.returned === 0 || offset >= count || page.returned < pageSize) break;
  }
  if (offset < count) throw new Error(`CER paging incomplete: got ${offset} of ${count} subnets`);
  if (offset === 0 && previousCount > 0) {
    throw new Error(`CER returned 0 subnets (last sync had ${previousCount}); keeping previous data`);
  }
  return { subnets, skippedNontrackable };
}

type Parsed<T> = { row: T; network: number; mask: number; bits: number };

function parseAll<T extends { cidr: string }>(rows: T[]): Parsed<T>[] {
  const out: Parsed<T>[] = [];
  for (const row of rows) {
    const p = parseCidr(row.cidr);
    if (!p) continue;
    out.push({ row, network: p.network, mask: p.mask, bits: parseInt(row.cidr.split("/")[1], 10) });
  }
  return out;
}

/** Index subnets by prefix length so an IP needs at most 33 lookups. */
type PrefixIndex<T> = { bits: number[]; byBits: Map<number, Map<number, Parsed<T>>> };

function indexByPrefix<T>(list: Parsed<T>[]): PrefixIndex<T> {
  const byBits = new Map<number, Map<number, Parsed<T>>>();
  for (const s of list) {
    let m = byBits.get(s.bits);
    if (!m) byBits.set(s.bits, (m = new Map()));
    const key = s.network >>> 0;
    if (!m.has(key)) m.set(key, s);
  }
  return { bits: [...byBits.keys()].sort((a, b) => b - a), byBits };
}

const maskFor = (bits: number) => (bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0);

/** All subnets containing ip, most specific first. */
function containing<T>(ip: number, idx: PrefixIndex<T>): Parsed<T>[] {
  const out: Parsed<T>[] = [];
  for (const b of idx.bits) {
    const hit = idx.byBits.get(b)!.get((ip & maskFor(b)) >>> 0);
    if (hit) out.push(hit);
  }
  return out;
}

function longestMatch<T>(ip: number, idx: PrefixIndex<T>): Parsed<T> | null {
  for (const b of idx.bits) {
    const hit = idx.byBits.get(b)!.get((ip & maskFor(b)) >>> 0);
    if (hit) return hit;
  }
  return null;
}

function overlaps(a: { network: number; mask: number }, b: { network: number; mask: number }): boolean {
  const mask = (a.mask & b.mask) >>> 0; // the shorter prefix
  return ((a.network & mask) >>> 0) === ((b.network & mask) >>> 0);
}

const IPV4 = /^\d+\.\d+\.\d+\.\d+$/;

export type Overview = {
  totals: { phones: number; mapped: number; noIp: number; sharedIp: number; unmappedWithIp: number };
  subnets: {
    id: number;
    cidr: string;
    name: string;
    description: string;
    phones: number;
    cmGroups: Record<string, number>;
    cerStatus?: CerStatus;
    cer?: { cidr: string; erlName: string; location: string; broad: boolean }[];
    replaceWith?: string[];
  }[];
  unmapped: {
    inCer: { cidr: string; erlName: string; location: string; phones: number; broad: boolean }[];
    notInCer: { cidr: string; phones: number }[];
  };
};

export function buildOverview(input: {
  appSubnets: { id: number; cidr: string; name: string; description: string }[];
  cerSubnets: CerSubnet[] | null;
  phones: { ip: string | null; cmGroup: string }[];
}): Overview {
  const { appSubnets, cerSubnets, phones } = input;
  const app = parseAll(appSubnets);
  const cer = cerSubnets ? parseAll(cerSubnets) : [];
  const appIdx = indexByPrefix(app);
  const cerIdx = indexByPrefix(cer);

  // Shared IPs (Expressway/MRA etc.): an IP seen on more than one phone.
  const ipCount = new Map<string, number>();
  for (const p of phones) {
    const ip = str(p.ip);
    if (IPV4.test(ip)) ipCount.set(ip, (ipCount.get(ip) || 0) + 1);
  }

  const totals = { phones: phones.length, mapped: 0, noIp: 0, sharedIp: 0, unmappedWithIp: 0 };
  const perSubnet = new Map<number, { phones: number; cmGroups: Record<string, number> }>();
  const cerHasPhone = new Set<string>();
  const inCer = new Map<string, number>();
  const notInCer = new Map<string, number>();

  for (const p of phones) {
    const ip = str(p.ip);
    if (!IPV4.test(ip)) {
      totals.noIp++;
      continue;
    }
    const long = ipToLong(ip);
    const shared = (ipCount.get(ip) || 0) > 1;

    // Shared IPs (Expressway/MRA) never feed CER replace/import suggestions.
    const cerHits = cerSubnets && !shared ? containing(long, cerIdx) : [];
    for (const c of cerHits) cerHasPhone.add(c.row.cidr);
    const cerHit = cerHits[0] ?? null;

    // A defined subnet that covers the IP claims the phone, shared or not (e.g. an Expressway /32).
    const appHit = longestMatch(long, appIdx);
    if (appHit) {
      totals.mapped++;
      const entry = perSubnet.get(appHit.row.id) || { phones: 0, cmGroups: {} };
      entry.phones++;
      const g = p.cmGroup || "Unknown";
      entry.cmGroups[g] = (entry.cmGroups[g] || 0) + 1;
      perSubnet.set(appHit.row.id, entry);
      continue;
    }
    if (shared) {
      totals.sharedIp++;
      continue;
    }
    totals.unmappedWithIp++;
    if (cerHit) {
      inCer.set(cerHit.row.cidr, (inCer.get(cerHit.row.cidr) || 0) + 1);
    } else {
      const guess = ip.split(".").slice(0, 3).join(".") + ".0/24";
      notInCer.set(guess, (notInCer.get(guess) || 0) + 1);
    }
  }

  const cerByCidr = new Map((cerSubnets || []).map((c) => [c.cidr, c]));
  const broad = (cidr: string) => parseInt(cidr.split("/")[1], 10) < BROAD_PREFIX;
  const byCidr = (a: string, b: string) => {
    const [na, ba] = a.split("/");
    const [nb, bb] = b.split("/");
    return ipToLong(na) - ipToLong(nb) || parseInt(ba, 10) - parseInt(bb, 10);
  };

  const subnets: Overview["subnets"] = app.map(({ row, network, mask }) => {
    const stats = perSubnet.get(row.id) || { phones: 0, cmGroups: {} };
    const base = { id: row.id, cidr: row.cidr, name: row.name, description: row.description, ...stats };
    if (!cerSubnets) return base;
    const over = cer
      .filter((c) => overlaps({ network, mask }, c))
      .map((c) => c.row.cidr)
      .sort(byCidr);
    const exact = over.includes(row.cidr);
    const cerStatus: CerStatus = exact ? "match" : over.length ? "mismatch" : "missing";
    const shown = exact ? [row.cidr] : over;
    const result: Overview["subnets"][number] = {
      ...base,
      cerStatus,
      cer: shown.map((c) => ({ cidr: c, erlName: cerByCidr.get(c)!.erlName, location: cerByCidr.get(c)!.location, broad: broad(c) })),
    };
    if (cerStatus === "mismatch") result.replaceWith = over.filter((c) => cerHasPhone.has(c));
    return result;
  });
  // Subnets that failed to parse still show, without stats.
  for (const s of appSubnets) {
    if (!subnets.some((x) => x.id === s.id)) subnets.push({ ...s, phones: 0, cmGroups: {} });
  }

  const sortRows = <R extends { cidr: string; phones: number }>(rows: R[]) =>
    rows.sort((a, b) => b.phones - a.phones || byCidr(a.cidr, b.cidr));

  return {
    totals,
    subnets,
    unmapped: {
      inCer: sortRows(
        [...inCer.entries()].map(([cidr, n]) => ({
          cidr,
          erlName: cerByCidr.get(cidr)!.erlName,
          location: cerByCidr.get(cidr)!.location,
          phones: n,
          broad: broad(cidr),
        })),
      ),
      notInCer: sortRows([...notInCer.entries()].map(([cidr, n]) => ({ cidr, phones: n }))),
    },
  };
}
