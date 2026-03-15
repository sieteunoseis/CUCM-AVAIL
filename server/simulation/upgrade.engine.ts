import { getDb } from "../db/database.js";

export interface UpgradeStep {
  stepNumber: number;
  serverId: number;
  serverName: string;
  serverHostname: string;
  isPublisher: boolean;
  isCcmActive: boolean;
  phonesReRegistering: number;
  phonesUnregistered: number;
  phonesUnaffected: number;
  affectedCmGroups: {
    cmGroupName: string;
    phonesReRegistering: number;
    phonesUnregistered: number;
  }[];
  notes: string[];
  estimatedMinutes: { min: number; max: number };
  agLabels: string[];
}

export interface ParallelGroup {
  groupNumber: number;
  steps: UpgradeStep[];
  combinedReRegistering: number;
  combinedUnregistered: number;
  estimatedMinutes: { min: number; max: number }; // max of individual steps (concurrent)
  agLabels: string[];
  notes: string[];
}

interface AvailabilityGroupInfo {
  label: string;
  servers: string[];
  cmgNames: string[];
  phoneCount: number;
}

export interface UpgradeAnalysis {
  totalSteps: number;
  totalServers: number;
  steps: UpgradeStep[];
  parallelGroups: ParallelGroup[];
  availabilityGroups: AvailabilityGroupInfo[];
  summary: {
    maxConcurrentReRegistrations: number;
    totalPhones: number;
    estimatedTotalMinutes: { min: number; max: number };
  };
  parallelSummary: {
    totalGroups: number;
    maxConcurrentReRegistrations: number;
    estimatedTotalMinutes: { min: number; max: number };
  };
}

/**
 * Analyze optimal upgrade order for CUCM nodes.
 *
 * Cisco Sequencing Rules:
 * 1. Publisher must be upgraded first (database master).
 * 2. Within each CMG, upgrade secondary/tertiary (backup) members before the primary.
 *    This keeps the primary online handling calls while backups are upgraded.
 * 3. Never take both members of a CMG offline simultaneously.
 * 4. Minimize phone re-registrations at each step (greedy least-impact).
 * 5. Each server completes its upgrade and comes back online before the next step.
 * 6. Verify DB replication after publisher upgrade before proceeding.
 */
export function analyzeUpgradeOrder(): UpgradeAnalysis {
  const db = getDb();

  // Get ALL servers (publisher may not have CCM active but must be upgraded first)
  const allServers = db
    .prepare("SELECT * FROM servers ORDER BY name")
    .all() as any[];

  if (allServers.length === 0) {
    return {
      totalSteps: 0,
      totalServers: 0,
      steps: [],
      parallelGroups: [],
      availabilityGroups: [],
      summary: { maxConcurrentReRegistrations: 0, totalPhones: 0, estimatedTotalMinutes: { min: 0, max: 0 } },
      parallelSummary: { totalGroups: 0, maxConcurrentReRegistrations: 0, estimatedTotalMinutes: { min: 0, max: 0 } },
    };
  }

  // Get all CMG memberships
  const cmGroups = db
    .prepare("SELECT * FROM cm_groups ORDER BY name")
    .all() as any[];

  const cmgMembers = new Map<number, any[]>();
  for (const cmg of cmGroups) {
    const members = db
      .prepare(
        `SELECT cgm.*, s.name as server_name, s.hostname
         FROM cm_group_members cgm
         JOIN servers s ON cgm.server_id = s.id
         WHERE cgm.cm_group_id = ?
         ORDER BY cgm.priority`
      )
      .all(cmg.id) as any[];
    cmgMembers.set(cmg.id, members);
  }

  // Build a map of server_id -> highest CMG priority (lowest number = primary)
  // A server that is priority 1 in any CMG is a "primary" for that group
  const serverBestPriority = new Map<number, number>();
  for (const members of cmgMembers.values()) {
    for (const m of members) {
      const current = serverBestPriority.get(m.server_id) ?? Infinity;
      if (m.priority < current) {
        serverBestPriority.set(m.server_id, m.priority);
      }
    }
  }

  const phoneServerMap = buildPhoneServerMap(db, cmGroups, cmgMembers);
  const ccmServerIds = new Set(
    allServers.filter((s: any) => s.ccm_service_active === 1).map((s: any) => s.id)
  );

  const steps: UpgradeStep[] = [];
  const upgraded = new Set<number>();

  // Step 1: Publisher first (Cisco requirement — regardless of CCM status)
  const publisher = allServers.find((s: any) => s.node_type === "Publisher");

  if (publisher) {
    const step = computeStep(
      publisher,
      1,
      upgraded,
      cmGroups,
      cmgMembers,
      phoneServerMap,
      ccmServerIds,
      db
    );
    step.notes.unshift("Publisher must be upgraded first per Cisco sequencing rules");
    step.notes.push("Verify DB replication (utils dbreplication runtimestate) before proceeding");
    steps.push(step);
    upgraded.add(publisher.id);
  }

  // Remaining servers: CCM-active subscribers first, then non-CCM nodes last
  const ccmSubscribers = allServers.filter(
    (s: any) => s.node_type !== "Publisher" && s.ccm_service_active === 1
  );
  const nonCcmSubscribers = allServers.filter(
    (s: any) => s.node_type !== "Publisher" && s.ccm_service_active !== 1
  );

  // Sort CCM subscribers using scoring:
  // - Prefer non-primary CMG members (priority > 1) before primary (priority 1)
  // - Within that, prefer least phone impact
  const remaining = [...ccmSubscribers];

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestScore = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const srv = remaining[i];
      const phoneImpact = estimateImpact(srv, upgraded, cmGroups, cmgMembers, phoneServerMap, ccmServerIds);
      const priority = serverBestPriority.get(srv.id) ?? Infinity;

      // Score: primary CMG members (priority 1) get a large penalty to push them later
      // This ensures backup members are upgraded first within each CMG
      const primaryPenalty = priority === 1 ? 100000 : 0;
      const score = primaryPenalty + phoneImpact;

      if (score < bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    const server = remaining.splice(bestIdx, 1)[0];
    const step = computeStep(
      server,
      steps.length + 1,
      upgraded,
      cmGroups,
      cmgMembers,
      phoneServerMap,
      ccmServerIds,
      db
    );

    // Add contextual notes
    const pri = serverBestPriority.get(server.id);
    if (pri !== undefined && pri > 1) {
      step.notes.push(`Backup CMG member (priority ${pri}) — safe to upgrade while primary stays online`);
    } else if (pri === 1) {
      step.notes.push("Primary CMG member — backup members should already be upgraded and online");
    }

    steps.push(step);
    upgraded.add(server.id);
  }

  // Non-CCM subscribers last (TFTP, MOH, media resources, etc.)
  // Group by hostname prefix to detect pairs (e.g., bictftp01/bictftp02)
  for (const server of nonCcmSubscribers) {
    const step = computeStep(
      server,
      steps.length + 1,
      upgraded,
      cmGroups,
      cmgMembers,
      phoneServerMap,
      ccmServerIds,
      db
    );
    step.notes.push("Non-CCM node (TFTP/MOH/media) — no call processing impact");
    step.notes.push("Can be upgraded in parallel with other non-CCM nodes if redundant pairs exist");
    steps.push(step);
    upgraded.add(server.id);
  }

  const totalPhones = db
    .prepare("SELECT COUNT(*) as count FROM phones")
    .get() as { count: number };

  // Compute Availability Groups (same logic as ag.routes.ts)
  const cmgServerSets = cmGroups.map((cmg: any) => {
    const members = cmgMembers.get(cmg.id) || [];
    const servers = members.map((m: any) => m.server_name.split(".")[0]).sort();
    return { cmg, servers, serverKey: servers.join(",") };
  });

  const channelMap = new Map<string, { servers: string[]; cmgs: any[] }>();
  for (const entry of cmgServerSets) {
    if (!channelMap.has(entry.serverKey)) {
      channelMap.set(entry.serverKey, { servers: entry.servers, cmgs: [] });
    }
    channelMap.get(entry.serverKey)!.cmgs.push(entry.cmg);
  }

  const phoneCounts = new Map<number, number>();
  const pcRows = db
    .prepare(
      `SELECT dp.cm_group_id, COUNT(p.id) as count
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id
       GROUP BY dp.cm_group_id`
    )
    .all() as { cm_group_id: number; count: number }[];
  for (const r of pcRows) {
    phoneCounts.set(r.cm_group_id, r.count);
  }

  const agChannels = Array.from(channelMap.values())
    .map((ch) => {
      const phoneCount = ch.cmgs.reduce(
        (sum: number, cmg: any) => sum + (phoneCounts.get(cmg.id) || 0),
        0
      );
      return { ...ch, phoneCount };
    })
    .sort((a, b) => b.phoneCount - a.phoneCount);

  const availabilityGroups: AvailabilityGroupInfo[] = agChannels.map((ch, i) => ({
    label: `AG-${i + 1}`,
    servers: ch.servers,
    cmgNames: ch.cmgs.map((c: any) => c.name),
    phoneCount: ch.phoneCount,
  }));

  // Build server name → AG labels map
  const serverAgMap = new Map<string, string[]>();
  for (const ag of availabilityGroups) {
    for (const srv of ag.servers) {
      if (!serverAgMap.has(srv)) {
        serverAgMap.set(srv, []);
      }
      serverAgMap.get(srv)!.push(ag.label);
    }
  }

  // Populate agLabels on each step
  for (const step of steps) {
    const shortName = step.serverName.split(".")[0];
    step.agLabels = serverAgMap.get(shortName) || [];
  }

  const totalMinMin = steps.reduce((s, st) => s + st.estimatedMinutes.min, 0);
  const totalMinMax = steps.reduce((s, st) => s + st.estimatedMinutes.max, 0);

  // Build parallel groups
  const parallelGroups = buildParallelGroups(steps, cmGroups, cmgMembers);

  const parallelTotalMin = parallelGroups.reduce((s, g) => s + g.estimatedMinutes.min, 0);
  const parallelTotalMax = parallelGroups.reduce((s, g) => s + g.estimatedMinutes.max, 0);

  return {
    totalSteps: steps.length,
    totalServers: allServers.length,
    steps,
    parallelGroups,
    availabilityGroups,
    summary: {
      maxConcurrentReRegistrations: steps.length > 0
        ? Math.max(...steps.map((s) => s.phonesReRegistering))
        : 0,
      totalPhones: totalPhones.count,
      estimatedTotalMinutes: { min: totalMinMin, max: totalMinMax },
    },
    parallelSummary: {
      totalGroups: parallelGroups.length,
      maxConcurrentReRegistrations: parallelGroups.length > 0
        ? Math.max(...parallelGroups.map((g) => g.combinedReRegistering))
        : 0,
      estimatedTotalMinutes: { min: parallelTotalMin, max: parallelTotalMax },
    },
  };
}

/**
 * Build parallel groups from the sequential step list.
 *
 * Rules for parallelization:
 * 1. Publisher always runs alone (step 1).
 * 2. Two CCM subscribers can run in parallel if they serve completely disjoint CMG sets
 *    (upgrading both simultaneously won't cause any CMG to lose more than one member at a time).
 * 3. Non-CCM subscribers (TFTP/MOH) can all run in parallel with each other
 *    (no call processing impact).
 * 4. Non-CCM servers can run in parallel with CCM servers IF they serve disjoint CMGs
 *    (which they always do since non-CCM servers typically aren't in CMGs).
 */
function buildParallelGroups(
  steps: UpgradeStep[],
  cmGroups: any[],
  cmgMembers: Map<number, any[]>
): ParallelGroup[] {
  if (steps.length === 0) return [];

  // Build a map: serverId -> set of CMG IDs the server belongs to
  const serverCmgSets = new Map<number, Set<number>>();
  for (const [cmgId, members] of cmgMembers.entries()) {
    for (const m of members) {
      if (!serverCmgSets.has(m.server_id)) {
        serverCmgSets.set(m.server_id, new Set());
      }
      serverCmgSets.get(m.server_id)!.add(cmgId);
    }
  }

  const groups: ParallelGroup[] = [];
  const assigned = new Set<number>(); // step indices already assigned

  for (let i = 0; i < steps.length; i++) {
    if (assigned.has(i)) continue;

    const step = steps[i];
    assigned.add(i);

    // Publisher always runs alone
    if (step.isPublisher) {
      groups.push(makeGroup(groups.length + 1, [step]));
      continue;
    }

    // Try to find other steps that can run in parallel with this one
    const groupSteps = [step];
    const groupCmgs = new Set(serverCmgSets.get(step.serverId) || []);

    for (let j = i + 1; j < steps.length; j++) {
      if (assigned.has(j)) continue;

      const candidate = steps[j];

      // Don't group publisher with anything
      if (candidate.isPublisher) continue;

      const candidateCmgs = serverCmgSets.get(candidate.serverId) || new Set();

      // Check if candidate shares any CMGs with the current group
      let hasOverlap = false;
      for (const cmgId of candidateCmgs) {
        if (groupCmgs.has(cmgId)) {
          hasOverlap = true;
          break;
        }
      }

      // Non-CCM servers with no CMG overlap can always be parallelized
      // CCM servers can be parallelized only if they have no CMG overlap
      if (!hasOverlap) {
        groupSteps.push(candidate);
        assigned.add(j);
        // Add candidate's CMGs to the group's CMG set
        for (const cmgId of candidateCmgs) {
          groupCmgs.add(cmgId);
        }
      }
    }

    groups.push(makeGroup(groups.length + 1, groupSteps));
  }

  return groups;
}

function makeGroup(groupNumber: number, steps: UpgradeStep[]): ParallelGroup {
  const combinedReReg = steps.reduce((s, st) => s + st.phonesReRegistering, 0);
  const combinedUnreg = steps.reduce((s, st) => s + st.phonesUnregistered, 0);

  // Parallel: time is the max of individual steps (they run concurrently)
  const estMin = Math.max(...steps.map((s) => s.estimatedMinutes.min));
  const estMax = Math.max(...steps.map((s) => s.estimatedMinutes.max));

  const notes: string[] = [];
  if (steps.length > 1) {
    notes.push(`${steps.length} servers upgrading in parallel`);
    const names = steps.map((s) => s.serverName.split(".")[0]).join(", ");
    notes.push(`Servers: ${names}`);
  }

  const agLabels = Array.from(new Set(steps.flatMap((s) => s.agLabels))).sort();

  return {
    groupNumber,
    steps,
    combinedReRegistering: combinedReReg,
    combinedUnregistered: combinedUnreg,
    estimatedMinutes: { min: estMin, max: estMax },
    agLabels,
    notes,
  };
}

function buildPhoneServerMap(
  db: any,
  cmGroups: any[],
  cmgMembers: Map<number, any[]>
): Map<number, number | null> {
  // For each phone, find its current server from latest registration or assume priority 1
  const phones = db
    .prepare(
      `SELECT p.id, p.name, dp.cm_group_id
       FROM phones p
       JOIN device_pools dp ON p.device_pool_id = dp.id`
    )
    .all() as any[];

  const phoneServerMap = new Map<number, number | null>();

  // Bulk load latest registrations
  const latestRegs = db
    .prepare(`SELECT phone_id, registered_server_id FROM latest_registrations`)
    .all() as { phone_id: number; registered_server_id: number | null }[];
  const latestRegMap = new Map<number, number | null>();
  for (const r of latestRegs) {
    latestRegMap.set(r.phone_id, r.registered_server_id);
  }

  for (const phone of phones) {
    const regServerId = latestRegMap.get(phone.id);
    if (regServerId) {
      phoneServerMap.set(phone.id, regServerId);
    } else {
      // Assume priority 1 server of CMG
      const members = cmgMembers.get(phone.cm_group_id);
      phoneServerMap.set(
        phone.id,
        members && members.length > 0 ? members[0].server_id : null
      );
    }
  }

  return phoneServerMap;
}

function estimateImpact(
  server: any,
  alreadyUpgraded: Set<number>,
  cmGroups: any[],
  cmgMembers: Map<number, any[]>,
  phoneServerMap: Map<number, number | null>,
  ccmServerIds: Set<number>
): number {
  // Count phones that would need to re-register if this server goes offline
  let reRegCount = 0;

  for (const [_phoneId, serverId] of phoneServerMap) {
    if (serverId === server.id) {
      reRegCount++;
    }
  }

  return reRegCount;
}

function computeStep(
  server: any,
  stepNumber: number,
  alreadyUpgraded: Set<number>,
  cmGroups: any[],
  cmgMembers: Map<number, any[]>,
  phoneServerMap: Map<number, number | null>,
  ccmServerIds: Set<number>,
  db: any
): UpgradeStep {
  const affectedCmGroupsMap = new Map<string, { reReg: number; unreg: number }>();
  let totalReReg = 0;
  let totalUnreg = 0;
  let totalUnaffected = 0;

  // For each CMG this server belongs to, check impact
  for (const cmg of cmGroups) {
    const members = cmgMembers.get(cmg.id) || [];
    const serverInCmg = members.find((m: any) => m.server_id === server.id);
    if (!serverInCmg) continue;

    // Find the next available server in this CMG (excluding the one being upgraded)
    const availableMembers = members.filter(
      (m: any) => m.server_id !== server.id
    );
    const fallbackServerId =
      availableMembers.length > 0 ? availableMembers[0].server_id : null;

    // Get phones in this CMG
    const phones = db
      .prepare(
        `SELECT p.id FROM phones p
         JOIN device_pools dp ON p.device_pool_id = dp.id
         WHERE dp.cm_group_id = ?`
      )
      .all(cmg.id) as any[];

    let cmgReReg = 0;
    let cmgUnreg = 0;

    for (const phone of phones) {
      const currentServer = phoneServerMap.get(phone.id);
      if (currentServer === server.id) {
        if (fallbackServerId !== null) {
          cmgReReg++;
          totalReReg++;
        } else {
          cmgUnreg++;
          totalUnreg++;
        }
      } else {
        totalUnaffected++;
      }
    }

    if (cmgReReg > 0 || cmgUnreg > 0) {
      affectedCmGroupsMap.set(cmg.name, { reReg: cmgReReg, unreg: cmgUnreg });
    }
  }

  const notes: string[] = [];
  if (server.node_type === "Publisher") {
    notes.push("Publisher must be upgraded first per Cisco sequencing rules");
  }
  if (totalUnreg > 0) {
    notes.push(
      `WARNING: ${totalUnreg} phones will lose registration — all CMG members offline`
    );
  }
  if (totalReReg === 0) {
    notes.push("No phone impact — server has no registered phones");
  }

  // Cisco time estimates (per node):
  // Publisher: 120-240 min upgrade + 30 min switch/reboot + 30-120 min DB replication
  // Subscriber (CCM active): 60-120 min upgrade + 30 min switch/reboot
  // Non-CCM subscriber: 60-120 min upgrade + 30 min switch/reboot
  const isPublisher = server.node_type === "Publisher";
  const isCcm = server.ccm_service_active === 1;
  let estimatedMinutes: { min: number; max: number };

  if (isPublisher) {
    // Publisher: upgrade + switch + DB replication wait
    estimatedMinutes = { min: 180, max: 390 };
  } else if (isCcm) {
    // CCM subscriber: upgrade + switch
    estimatedMinutes = { min: 90, max: 150 };
  } else {
    // Non-CCM (TFTP, MOH): upgrade + switch
    estimatedMinutes = { min: 90, max: 150 };
  }

  return {
    stepNumber,
    serverId: server.id,
    serverName: server.name,
    serverHostname: server.hostname,
    isPublisher,
    isCcmActive: isCcm,
    phonesReRegistering: totalReReg,
    phonesUnregistered: totalUnreg,
    phonesUnaffected: totalUnaffected,
    affectedCmGroups: Array.from(affectedCmGroupsMap.entries()).map(
      ([name, counts]) => ({
        cmGroupName: name,
        phonesReRegistering: counts.reReg,
        phonesUnregistered: counts.unreg,
      })
    ),
    notes,
    estimatedMinutes,
    agLabels: [], // populated later in analyzeUpgradeOrder
  };
}
