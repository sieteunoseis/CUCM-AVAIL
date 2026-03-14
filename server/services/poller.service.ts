import cron from "node-cron";
import { config } from "../config.js";
import { pollRegistrations, pollTrunkRegistrations } from "./risport.service.js";
import { checkAllServersServiceStatus } from "./serviceability.service.js";
import {
  getAllServers,
  getPhoneByName,
  getServerByName,
  insertRegistrationBatch,
  insertTrunkSnapshotBatch,
  getTrunkByName,
  updateServerServiceStatus,
  pruneOldSnapshots,
} from "../db/queries.js";

let lastPollTime: Date | null = null;
let pollInProgress = false;

type PollCallback = () => void;
let onPollComplete: PollCallback | null = null;

export function setOnPollComplete(cb: PollCallback) {
  onPollComplete = cb;
}

export function getLastPollTime() {
  return lastPollTime;
}

export function isPollInProgress() {
  return pollInProgress;
}

export async function runPoll() {
  if (pollInProgress) {
    console.log("[Poller] Poll already in progress, skipping");
    return;
  }

  pollInProgress = true;
  console.log("[Poller] Starting poll cycle...");

  try {
    // 1. Check serviceability status for all servers
    const servers = getAllServers() as any[];
    if (servers.length > 0) {
      const hostnames = servers.map((s: any) => s.hostname);
      const statuses = await checkAllServersServiceStatus(hostnames);
      for (const status of statuses) {
        const server = servers.find(
          (s: any) => s.hostname === status.serverHostname
        );
        if (server) {
          const isActive =
            status.status === "Started" || status.status === "started";
          updateServerServiceStatus(server.id, isActive);
        }
      }
      console.log("[Poller] Service status updated for all servers");
    }

    // 2. Poll RISPort for phone registrations
    const risResults = await pollRegistrations();
    const snapshots: {
      phoneId: number;
      registeredServerId: number | null;
      status: string;
      ipAddress: string;
    }[] = [];

    for (const node of risResults) {
      const server = getServerByName(node.nodeName) as any;
      for (const device of node.devices) {
        const phone = getPhoneByName(device.name) as any;
        if (phone) {
          snapshots.push({
            phoneId: phone.id,
            registeredServerId: server?.id || null,
            status: device.status,
            ipAddress: device.ipAddress,
          });
        }
      }
    }

    if (snapshots.length > 0) {
      insertRegistrationBatch(snapshots);
      console.log(
        `[Poller] Saved ${snapshots.length} registration snapshots`
      );
    }

    // 3. Poll RISPort for SIP trunk registrations
    try {
      const trunkResults = await pollTrunkRegistrations();
      const trunkSnapshots: {
        trunkId: number;
        registeredServerId: number | null;
        status: string;
        ipAddress: string;
      }[] = [];

      for (const node of trunkResults) {
        const server = getServerByName(node.nodeName) as any;
        for (const device of node.devices) {
          const trunk = getTrunkByName(device.name) as any;
          if (trunk) {
            trunkSnapshots.push({
              trunkId: trunk.id,
              registeredServerId: server?.id || null,
              status: device.status,
              ipAddress: device.ipAddress,
            });
          }
        }
      }

      if (trunkSnapshots.length > 0) {
        insertTrunkSnapshotBatch(trunkSnapshots);
        console.log(
          `[Poller] Saved ${trunkSnapshots.length} trunk snapshots`
        );
      }
    } catch (err) {
      console.error("[Poller] Trunk polling failed (non-fatal):", err);
    }

    // 4. Prune old data
    pruneOldSnapshots(7);

    lastPollTime = new Date();
    console.log("[Poller] Poll cycle complete");

    if (onPollComplete) {
      onPollComplete();
    }
  } catch (err) {
    console.error("[Poller] Poll cycle failed:", err);
  } finally {
    pollInProgress = false;
  }
}

export function startPoller() {
  const cronExpr = `*/${config.polling.intervalMinutes} * * * *`;
  console.log(
    `[Poller] Scheduling polls every ${config.polling.intervalMinutes} minutes`
  );
  cron.schedule(cronExpr, runPoll);

  // Run initial poll after a short delay to let the server start
  setTimeout(runPoll, 5000);
}
