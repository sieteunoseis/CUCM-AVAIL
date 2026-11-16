import https from "node:https";
import { config } from "../config.js";
import { pageThrough, type CerSubnet } from "../utils/cer.js";
import { replaceCerSubnets, recordCerSyncError, getCerSyncStatus } from "../db/queries.js";
import { invalidateCache } from "./cache.service.js";

const PAGE = 500;
const TIMEOUT_MS = 30_000;

// CER's certificate fails OpenSSL 3's default security level (handshake_failure on Node 22),
// so CER requests — and only CER requests — use SECLEVEL=0. Verification still follows
// NODE_TLS_REJECT_UNAUTHORIZED like the rest of the app (CER is usually self-signed).
const cerAgent = new https.Agent({
  ciphers: "DEFAULT@SECLEVEL=0",
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== "0",
  keepAlive: true,
});

function getJson(url: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent: cerAgent, headers, timeout: TIMEOUT_MS }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`CER returned ${res.statusCode}${body ? `: ${body.slice(0, 200)}` : ""}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          reject(new Error("CER returned a non-JSON response"));
        }
      });
      res.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error(`CER did not answer within ${TIMEOUT_MS / 1000}s`)));
    req.on("error", reject);
  });
}

/** Fetch every IPv4 subnet from CER (paged). Throws on any failed, odd or incomplete page. */
export async function fetchCerSubnets(): Promise<{ subnets: CerSubnet[]; skippedNontrackable: number }> {
  const { host, username, password } = config.cer;
  const auth = "Basic " + Buffer.from(`${username}:${password}`).toString("base64");
  const previous = getCerSyncStatus()?.last_success ? getCerSyncStatus()!.subnet_count : 0;
  return pageThrough(
    async (offset) =>
      getJson(`https://${host}/cerappservices/service/v1/ipsubnet?offset=${offset}&limit=${PAGE}`, {
        Authorization: auth,
        Accept: "application/json",
      }),
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
    const err = e as Error & { code?: string };
    const msg = err.code ? `${err.message} (${err.code})` : err.message;
    recordCerSyncError(msg);
    invalidateCache("subnet:");
    console.error(`[CER] Sync failed: ${msg}`);
    throw new Error(msg);
  }
}
