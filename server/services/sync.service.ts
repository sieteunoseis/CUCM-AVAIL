import {
  getAllServers as axlGetServers,
  getAllCmGroups as axlGetCmGroups,
  getAllDevicePools as axlGetDevicePools,
  getAllPhonesSql,
  getAllSipTrunksSql,
  getAllGatewaysSql,
} from "./axl.service.js";
import {
  upsertServer,
  upsertCmGroup,
  setCmGroupMembers,
  upsertDevicePool,
  upsertPhone,
  upsertTrunk,
  upsertGateway,
  getServerByName,
} from "../db/queries.js";
import { config } from "../config.js";

export async function syncAll() {
  console.log("[Sync] Starting full AXL sync...");

  // 1. Sync servers
  const servers = await axlGetServers();
  for (const server of servers) {
    upsertServer(server);
  }
  console.log(`[Sync] Synced ${servers.length} servers`);

  // 2. Sync CM Groups
  const cmGroups = await axlGetCmGroups();
  for (const group of cmGroups) {
    const cmGroupId = upsertCmGroup(group.name);
    const members = group.members
      .map((m) => {
        const server = getServerByName(m.serverName) as any;
        if (!server) return null;
        return { serverId: server.id, priority: m.priority };
      })
      .filter((m): m is { serverId: number; priority: number } => m !== null);
    setCmGroupMembers(cmGroupId, members);
  }
  console.log(`[Sync] Synced ${cmGroups.length} CM groups`);

  // 3. Sync Device Pools
  const devicePools = await axlGetDevicePools();
  const cmGroupMap = new Map<string, number>();
  for (const group of cmGroups) {
    const id = upsertCmGroup(group.name);
    cmGroupMap.set(group.name, id);
  }
  for (const dp of devicePools) {
    const cmGroupId = cmGroupMap.get(dp.cmGroupName);
    if (cmGroupId) {
      upsertDevicePool(dp.name, cmGroupId);
    }
  }
  console.log(`[Sync] Synced ${devicePools.length} device pools`);

  // 4. Sync Phones via SQL query
  const phones = await getAllPhonesSql();
  const dpMap = new Map<string, number>();
  for (const dp of devicePools) {
    const cmGroupId = cmGroupMap.get(dp.cmGroupName);
    if (cmGroupId) {
      const id = upsertDevicePool(dp.name, cmGroupId);
      dpMap.set(dp.name, id);
    }
  }
  let phoneCount = 0;
  for (const phone of phones) {
    const devicePoolId = dpMap.get(phone.devicePoolName);
    if (devicePoolId) {
      upsertPhone({
        name: phone.name,
        description: phone.description,
        model: phone.model,
        devicePoolId,
      });
      phoneCount++;
    }
  }
  console.log(`[Sync] Synced ${phoneCount} phones`);

  // 5. Sync SIP Trunks via SQL query
  let trunkCount = 0;
  try {
    const trunks = await getAllSipTrunksSql();
    for (const trunk of trunks) {
      const devicePoolId = dpMap.get(trunk.devicePoolName);
      if (devicePoolId) {
        upsertTrunk({
          name: trunk.name,
          description: trunk.description,
          devicePoolId,
        });
        trunkCount++;
      }
    }
    console.log(`[Sync] Synced ${trunkCount} SIP trunks`);
  } catch (e) {
    console.error("[Sync] SIP trunk sync failed (non-fatal):", e);
  }

  // 6. Sync MGCP Gateways (if enabled)
  let gatewayCount = 0;
  if (config.features.enableGateways) {
    try {
      const gateways = await getAllGatewaysSql();
      for (const gw of gateways) {
        const devicePoolId = dpMap.get(gw.devicePoolName);
        if (devicePoolId) {
          upsertGateway({
            name: gw.name,
            description: gw.description,
            domainName: gw.domainName,
            devicePoolId,
          });
          gatewayCount++;
        }
      }
      console.log(`[Sync] Synced ${gatewayCount} MGCP gateways`);
    } catch (e) {
      console.error("[Sync] Gateway sync failed (non-fatal):", e);
    }
  }

  return {
    servers: servers.length,
    cmGroups: cmGroups.length,
    devicePools: devicePools.length,
    phones: phoneCount,
    trunks: trunkCount,
    gateways: gatewayCount,
  };
}
