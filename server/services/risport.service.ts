import risPortService from "cisco-risport";
import { config } from "../config.js";
import { getDb } from "../db/database.js";

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
    lastActive: string;
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

function getGatewayNamesFromDb(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT name FROM gateways")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function parseDevice(d: any) {
  return {
    name: d.Name || d.name || "",
    ipAddress:
      d.IPAddress?.item?.IP || d.IPAddress?.IP || d.IpAddress || "",
    status: d.Status || d.status || "Unknown",
    statusReason: d.StatusReason || d.statusReason || "",
    dirNumber: (d.DirNumber || d.dirNumber || "").replace(/-(?:Registered|UnRegistered|Rejected|PartiallyRegistered|Unknown)/g, ""),
    protocol: d.Protocol || d.protocol || "",
    activeLoadId: d.ActiveLoadID || d.activeLoadID || d.ActiveLoadId || "",
    timeStamp: (() => {
      const ts = d.TimeStamp || d.timeStamp || "";
      if (!ts) return "";
      const num = parseInt(ts, 10);
      if (!isNaN(num) && num > 1000000000) return new Date(num * 1000).toISOString();
      return ts;
    })(),
    lastActive: (() => {
      const ts = d.LastActive || d.lastActive || "";
      if (!ts) return "";
      const num = parseInt(ts, 10);
      if (!isNaN(num) && num > 1000000000) return new Date(num * 1000).toISOString();
      return ts;
    })(),
    loginUserId: d.LoginUserId || d.loginUserId || "",
  };
}

function parseDeviceBasic(d: any) {
  return {
    name: d.Name || d.name || "",
    ipAddress:
      d.IPAddress?.item?.IP || d.IPAddress?.IP || d.IpAddress || "",
    status: d.Status || d.status || "Unknown",
    statusReason: "",
    dirNumber: "",
    protocol: "",
    activeLoadId: "",
    timeStamp: "",
    lastActive: "",
    loginUserId: "",
  };
}

function mergeNodeResults(allResults: RisDeviceResult[], nodes: any[], parseFn: (d: any) => any) {
  for (const node of nodes) {
    const devices = node.CmDevices?.item
      ? Array.isArray(node.CmDevices.item)
        ? node.CmDevices.item
        : [node.CmDevices.item]
      : [];

    const nodeName = node.Name || node.name || "";
    const parsed = devices.map(parseFn);
    const existing = allResults.find((r) => r.nodeName === nodeName);

    if (existing) {
      existing.devices.push(...parsed);
    } else {
      allResults.push({ nodeName, devices: parsed });
    }
  }
}

export async function pollRegistrations(): Promise<RisDeviceResult[]> {
  const svc = getService();
  const phoneNames = getPhoneNamesFromDb();

  if (phoneNames.length === 0) {
    emitLog("[RISPort] No phones in DB to query");
    return [];
  }

  const totalBatches = Math.ceil(phoneNames.length / 1000);
  emitLog(`[RISPort] ${phoneNames.length} phones, ${totalBatches} batches, 5s between batches`);

  const result = await svc.selectCmDeviceBatched(
    {
      action: "SelectCmDeviceExt",
      maxReturned: 1000,
      deviceClass: "Phone",
      model: 255,
      status: "Any",
      selectBy: "Name",
      protocol: "Any",
      downloadStatus: "Any",
    },
    {},
    phoneNames,
    {
      chunkSize: 1000,
      delayMs: 5000,
      onProgress: (batch: number, total: number) => {
        if (batch < total) {
          emitLog(`[RISPort] Batch ${batch + 1}/${total} (${Math.min((batch + 1) * 1000, phoneNames.length)} devices)`);
        }
      },
    }
  );

  const allResults: RisDeviceResult[] = [];
  const nodes = Array.isArray(result.results) ? result.results : result.results ? [result.results] : [];
  mergeNodeResults(allResults, nodes, parseDevice);

  return allResults;
}

export async function pollGatewayRegistrations(): Promise<RisDeviceResult[]> {
  const svc = getService();
  const gatewayNames = getGatewayNamesFromDb();

  if (gatewayNames.length === 0) {
    return [];
  }

  emitLog(`[RISPort] Polling ${gatewayNames.length} MGCP gateways`);

  const result = await svc.selectCmDeviceBatched(
    {
      action: "SelectCmDeviceExt",
      maxReturned: 1000,
      deviceClass: "Gateway",
      model: 255,
      status: "Any",
      selectBy: "Name",
      protocol: "Any",
      downloadStatus: "Any",
    },
    {},
    gatewayNames,
    {
      chunkSize: 1000,
      delayMs: 5000,
      onProgress: (batch: number, total: number) => {
        if (batch < total && total > 1) {
          emitLog(`[RISPort] Gateway batch ${batch + 1}/${total} (${Math.min((batch + 1) * 1000, gatewayNames.length)} devices)`);
        }
      },
    }
  );

  const allResults: RisDeviceResult[] = [];
  const nodes = Array.isArray(result.results) ? result.results : result.results ? [result.results] : [];
  mergeNodeResults(allResults, nodes, parseDeviceBasic);

  return allResults;
}

export async function pollTrunkRegistrations(): Promise<RisDeviceResult[]> {
  const svc = getService();
  const trunkNames = getTrunkNamesFromDb();

  if (trunkNames.length === 0) {
    return [];
  }

  emitLog(`[RISPort] Polling ${trunkNames.length} SIP trunks`);

  const result = await svc.selectCmDevice({
    action: "SelectCmDeviceExt",
    maxReturned: trunkNames.length,
    deviceClass: "SIPTrunk",
    model: 255,
    status: "Any",
    selectBy: "Name",
    selectItems: trunkNames,
    protocol: "Any",
    downloadStatus: "Any",
  });

  const allResults: RisDeviceResult[] = [];
  const nodes = Array.isArray(result.results) ? result.results : result.results ? [result.results] : [];
  mergeNodeResults(allResults, nodes, parseDeviceBasic);

  return allResults;
}
