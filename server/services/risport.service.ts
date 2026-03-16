import risPortService from "cisco-risport";
import { config } from "../config.js";
import { getDb } from "../db/database.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let service: any;
type LogCallback = (message: string) => void;
let onRisLog: LogCallback | null = null;

export function setOnRisLog(cb: LogCallback) {
  onRisLog = cb;
}

function emitLog(message: string) {
  console.log(message);
  if (onRisLog) onRisLog(message);
}

function getService() {
  if (!service) {
    service = new risPortService(
      config.cucm.host,
      config.cucm.username,
      config.cucm.password
    );
  }
  return service;
}

export interface RisDeviceResult {
  nodeName: string;
  devices: {
    name: string;
    ipAddress: string;
    status: string;
    statusReason: string;
    dirNumber: string;
    protocol: string;
    activeLoadId: string;
    timeStamp: string;
    loginUserId: string;
  }[];
}

function getPhoneNamesFromDb(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT name FROM phones")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function getTrunkNamesFromDb(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT name FROM trunks")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export async function pollRegistrations(): Promise<RisDeviceResult[]> {
  const svc = getService();
  const phoneNames = getPhoneNamesFromDb();

  if (phoneNames.length === 0) {
    emitLog("[RISPort] No phones in DB to query");
    return [];
  }

  // Chunk into batches of 1000, spaced out to be gentle on CUCM
  const allResults: RisDeviceResult[] = [];
  const batchSize = 1000;
  const totalBatches = Math.ceil(phoneNames.length / batchSize);

  // CUCM allows 15 RISPort requests/min — use 5s between batches to stay under limit
  const delayBetweenBatches = 5000;

  emitLog(`[RISPort] ${phoneNames.length} phones, ${totalBatches} batches, ${Math.round(delayBetweenBatches / 1000)}s between batches`);

  for (let i = 0; i < phoneNames.length; i += batchSize) {
    const batch = phoneNames.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    emitLog(`[RISPort] Batch ${batchNum}/${totalBatches} (${batch.length} devices)`);

    // Wait between batches (not before the first one)
    if (i > 0 && delayBetweenBatches > 0) {
      await sleep(delayBetweenBatches);
    }

    let result: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await svc.selectCmDevice(
          "SelectCmDeviceExt",
          batch.length,
          "Phone",
          255,
          "Any",
          "",
          "Name",
          batch,
          "Any",
          "Any"
        );
        break;
      } catch (err: any) {
        const isRateLimit = err?.message?.includes("Exceeded allowed rate") || err?.status === 429;
        if (isRateLimit && attempt < 2) {
          emitLog(`[RISPort] Rate limited on batch ${batchNum}, waiting 30s before retry...`);
          await sleep(30000);
        } else {
          throw err;
        }
      }
    }

    const nodes = Array.isArray(result.results)
      ? result.results
      : result.results
        ? [result.results]
        : [];

    for (const node of nodes) {
      const devices = node.CmDevices?.item
        ? Array.isArray(node.CmDevices.item)
          ? node.CmDevices.item
          : [node.CmDevices.item]
        : [];

      const existing = allResults.find((r) => r.nodeName === (node.Name || node.name || ""));
      const parsed = devices.map((d: any) => ({
        name: d.Name || d.name || "",
        ipAddress:
          d.IPAddress?.item?.IP || d.IPAddress?.IP || d.IpAddress || "",
        status: d.Status || d.status || "Unknown",
        statusReason: d.StatusReason || d.statusReason || "",
        dirNumber: d.DirNumber || d.dirNumber || "",
        protocol: d.Protocol || d.protocol || "",
        activeLoadId: d.ActiveLoadID || d.activeLoadID || d.ActiveLoadId || "",
        timeStamp: d.TimeStamp || d.timeStamp || "",
        loginUserId: d.LoginUserId || d.loginUserId || "",
      }));

      if (existing) {
        existing.devices.push(...parsed);
      } else {
        allResults.push({
          nodeName: node.Name || node.name || "",
          devices: parsed,
        });
      }
    }
  }

  return allResults;
}

function getGatewayNamesFromDb(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT name FROM gateways")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

export async function pollGatewayRegistrations(): Promise<RisDeviceResult[]> {
  const svc = getService();
  const gatewayNames = getGatewayNamesFromDb();

  if (gatewayNames.length === 0) {
    return [];
  }

  emitLog(`[RISPort] Polling ${gatewayNames.length} MGCP gateways`);

  const allResults: RisDeviceResult[] = [];
  const batchSize = 1000;
  const totalBatches = Math.ceil(gatewayNames.length / batchSize);

  for (let i = 0; i < gatewayNames.length; i += batchSize) {
    const batch = gatewayNames.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    if (totalBatches > 1) {
      emitLog(`[RISPort] Gateway batch ${batchNum}/${totalBatches} (${batch.length} devices)`);
    }

    if (i > 0) {
      await sleep(5000);
    }

    const result = await svc.selectCmDevice(
      "SelectCmDeviceExt",
      batch.length,
      "Gateway",
      255,
      "Any",
      "",
      "Name",
      batch,
      "Any",
      "Any"
    );

    const nodes = Array.isArray(result.results)
      ? result.results
      : result.results
        ? [result.results]
        : [];

    for (const node of nodes) {
      const devices = node.CmDevices?.item
        ? Array.isArray(node.CmDevices.item)
          ? node.CmDevices.item
          : [node.CmDevices.item]
        : [];

      const parsed = devices.map((d: any) => ({
        name: d.Name || d.name || "",
        ipAddress:
          d.IPAddress?.item?.IP || d.IPAddress?.IP || d.IpAddress || "",
        status: d.Status || d.status || "Unknown",
      }));

      const existing = allResults.find((r) => r.nodeName === (node.Name || node.name || ""));
      if (existing) {
        existing.devices.push(...parsed);
      } else {
        allResults.push({
          nodeName: node.Name || node.name || "",
          devices: parsed,
        });
      }
    }
  }

  return allResults;
}

export async function pollTrunkRegistrations(): Promise<RisDeviceResult[]> {
  const svc = getService();
  const trunkNames = getTrunkNamesFromDb();

  if (trunkNames.length === 0) {
    return [];
  }

  emitLog(`[RISPort] Polling ${trunkNames.length} SIP trunks`);

  // Trunks are usually few — single batch is fine
  const result = await svc.selectCmDevice(
    "SelectCmDeviceExt",
    trunkNames.length,
    "SIPTrunk",
    255,
    "Any",
    "",
    "Name",
    trunkNames,
    "Any",
    "Any"
  );

  const allResults: RisDeviceResult[] = [];
  const nodes = Array.isArray(result.results)
    ? result.results
    : result.results
      ? [result.results]
      : [];

  for (const node of nodes) {
    const devices = node.CmDevices?.item
      ? Array.isArray(node.CmDevices.item)
        ? node.CmDevices.item
        : [node.CmDevices.item]
      : [];

    const parsed = devices.map((d: any) => ({
      name: d.Name || d.name || "",
      ipAddress:
        d.IPAddress?.item?.IP || d.IPAddress?.IP || d.IpAddress || "",
      status: d.Status || d.status || "Unknown",
    }));

    const existing = allResults.find((r) => r.nodeName === (node.Name || node.name || ""));
    if (existing) {
      existing.devices.push(...parsed);
    } else {
      allResults.push({
        nodeName: node.Name || node.name || "",
        devices: parsed,
      });
    }
  }

  return allResults;
}
