import { config } from "../config.js";
import { normalizeCerPage, type CerSubnet } from "../utils/cer.js";
import { replaceCerSubnets, recordCerSyncError } from "../db/queries.js";
import { invalidateCache } from "./cache.service.js";

const PAGE = 500;

/** Fetch every IPv4 subnet from CER (paged). Throws on any failed page. */
export async function fetchCerSubnets(): Promise<{ subnets: CerSubnet[]; skippedNontrackable: number }> {
  const { host, username, password } = config.cer;
  const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  const subnets: CerSubnet[] = [];
  let skippedNontrackable = 0;
  let offset = 0;
  // Hard stop well above any real CER size, in case paging never ends.
  for (let guard = 0; guard < 200; guard++) {
    const url = `https://${host}/cerappservices/service/v1/ipsubnet?offset=${offset}&limit=${PAGE}`;
    const res = await fetch(url, { headers: { Authorization: auth, Accept: "application/json" } });
    if (!res.ok) {
      const body = (await res.text()).slice(0, 200);
      throw new Error(`CER returned ${res.status}${body ? `: ${body}` : ""}`);
    }
    const page = normalizeCerPage(await res.json());
    subnets.push(...page.subnets);
    skippedNontrackable += page.skippedNontrackable;
    offset += page.returned;
    if (page.returned === 0 || offset >= page.count) break;
  }
  return { subnets, skippedNontrackable };
}

/** Sync CER subnets into the local table. Leaves old data untouched on failure. */
export async function syncCer(): Promise<{ subnets: number; skippedNontrackable: number }> {
  console.log("[CER] Starting subnet sync...");
  try {
    const { subnets, skippedNontrackable } = await fetchCerSubnets();
    replaceCerSubnets(subnets, skippedNontrackable);
    invalidateCache("subnet:");
    console.log(`[CER] Synced ${subnets.length} subnets (${skippedNontrackable} non-trackable skipped)`);
    return { subnets: subnets.length, skippedNontrackable };
  } catch (e) {
    const msg = (e as Error).message;
    recordCerSyncError(msg);
    console.error(`[CER] Sync failed: ${msg}`);
    throw e;
  }
}
