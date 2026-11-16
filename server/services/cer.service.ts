import { config } from "../config.js";
import { pageThrough, type CerSubnet } from "../utils/cer.js";
import { replaceCerSubnets, recordCerSyncError, getCerSyncStatus } from "../db/queries.js";
import { invalidateCache } from "./cache.service.js";

const PAGE = 500;
const TIMEOUT_MS = 30_000;

/** Fetch every IPv4 subnet from CER (paged). Throws on any failed, odd or incomplete page. */
export async function fetchCerSubnets(): Promise<{ subnets: CerSubnet[]; skippedNontrackable: number }> {
  const { host, username, password } = config.cer;
  const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  const previous = getCerSyncStatus()?.last_success ? getCerSyncStatus()!.subnet_count : 0;
  return pageThrough(
    async (offset) => {
      const url = `https://${host}/cerappservices/service/v1/ipsubnet?offset=${offset}&limit=${PAGE}`;
      const res = await fetch(url, {
        headers: { Authorization: auth, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200);
        throw new Error(`CER returned ${res.status}${body ? `: ${body}` : ""}`);
      }
      return res.json();
    },
    PAGE,
    previous,
  );
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
    const msg = (e as Error).name === "TimeoutError" ? `CER did not answer within ${TIMEOUT_MS / 1000}s` : (e as Error).message;
    recordCerSyncError(msg);
    invalidateCache("subnet:");
    console.error(`[CER] Sync failed: ${msg}`);
    throw new Error(msg);
  }
}
