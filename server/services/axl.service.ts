import axlService from "cisco-axl";
import { config } from "../config.js";
import type { CucmServer, DevicePool } from "../types/index.js";

let service: any;

function getService() {
  if (!service) {
    service = new axlService(
      config.cucm.host,
      config.cucm.username,
      config.cucm.password,
      config.cucm.version
    );
  }
  return service;
}

export async function getAllServers(): Promise<CucmServer[]> {
  const svc = getService();
  const result = await svc.executeOperation("listProcessNode", {
    searchCriteria: { name: "%" },
    returnedTags: { name: "", description: "", nodeUsage: "" },
  });

  const nodes = Array.isArray(result.processNode)
    ? result.processNode
    : result.processNode
      ? [result.processNode]
      : [];

  return nodes
    .filter((n: any) => n.name !== "EnterpriseWideData")
    .map((node: any) => ({
      name: node.name,
      hostname: node.name,
      nodeType: node.nodeUsage || "Unknown",
      ccmServiceActive: false,
    }));
}

export async function getAllCmGroups(): Promise<
  { name: string; members: { serverName: string; priority: number }[] }[]
> {
  const svc = getService();

  // Use SQL to get CMG members with priority — listCallManagerGroup
  // doesn't return members in returnedTags
  const result = await svc.executeOperation("executeSQLQuery", {
    sql: `SELECT cmg.name as cmgname, pn.name as servername, cmgm.priority
          FROM callmanagergroup cmg
          JOIN callmanagergroupmember cmgm ON cmgm.fkcallmanagergroup = cmg.pkid
          JOIN callmanager cm ON cmgm.fkcallmanager = cm.pkid
          JOIN processnode pn ON cm.fkprocessnode = pn.pkid
          ORDER BY cmg.name, cmgm.priority`,
  });

  const rows = Array.isArray(result.row)
    ? result.row
    : result.row
      ? [result.row]
      : [];

  // Group rows by CMG name
  const groupMap = new Map<
    string,
    { serverName: string; priority: number }[]
  >();
  for (const row of rows) {
    const cmgName = row.cmgname || "";
    if (!groupMap.has(cmgName)) {
      groupMap.set(cmgName, []);
    }
    groupMap.get(cmgName)!.push({
      serverName: row.servername || "",
      priority: parseInt(row.priority || "0", 10),
    });
  }

  return Array.from(groupMap.entries()).map(([name, members]) => ({
    name,
    members,
  }));
}

export async function getAllDevicePools(): Promise<DevicePool[]> {
  const svc = getService();
  const result = await svc.executeOperation("listDevicePool", {
    searchCriteria: { name: "%" },
    returnedTags: {
      name: "",
      callManagerGroupName: "",
    },
  });

  const pools = Array.isArray(result.devicePool)
    ? result.devicePool
    : result.devicePool
      ? [result.devicePool]
      : [];

  return pools.map((dp: any) => ({
    name: dp.name,
    cmGroupName:
      dp.callManagerGroupName?.value ||
      dp.callManagerGroupName?._ ||
      dp.callManagerGroupName ||
      "",
  }));
}

export async function getAllSipTrunksSql(): Promise<
  {
    name: string;
    description: string;
    devicePoolName: string;
    destination: string;
  }[]
> {
  const svc = getService();
  const result = await svc.executeOperation("executeSQLQuery", {
    sql: `SELECT d.name, d.description, dp.name as devicepool
          FROM device d
          JOIN devicepool dp ON d.fkdevicepool = dp.pkid
          WHERE d.tkclass = 18`,
  });

  if (!result) return [];

  const rows = Array.isArray(result.row)
    ? result.row
    : result.row
      ? [result.row]
      : [];

  return rows.map((r: any) => ({
    name: r.name || "",
    description: r.description || "",
    devicePoolName: r.devicepool || "",
    destination: r.destination || "",
  }));
}

export async function getAllPhonesSql(): Promise<
  {
    name: string;
    description: string;
    model: string;
    devicePoolName: string;
  }[]
> {
  const svc = getService();
  const result = await svc.executeOperation("executeSQLQuery", {
    sql: `SELECT d.name, d.description, tm.name as model, dp.name as devicepool
          FROM device d
          JOIN devicepool dp ON d.fkdevicepool = dp.pkid
          LEFT JOIN typemodel tm ON d.tkmodel = tm.enum
          WHERE d.tkclass IN (1, 254)`,
  });

  const rows = Array.isArray(result.row)
    ? result.row
    : result.row
      ? [result.row]
      : [];

  return rows.map((r: any) => ({
    name: r.name || "",
    description: r.description || "",
    model: r.model || "",
    devicePoolName: r.devicepool || "",
  }));
}
