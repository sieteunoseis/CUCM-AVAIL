const BASE = import.meta.env.DEV ? "http://localhost:3000" : "";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
  return res.json();
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`PUT ${path}: ${res.status}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`DELETE ${path}: ${res.status}`);
  return res.json();
}

export interface Server {
  id: number;
  name: string;
  hostname: string;
  node_type: string;
  ccm_service_active: number;
  last_checked_at: string | null;
}

export interface CmGroupMember {
  priority: number;
  server_id: number;
  server_name: string;
  hostname: string;
}

export interface CmGroup {
  id: number;
  name: string;
  created_at: string;
  members: CmGroupMember[];
}

export interface Phone {
  id: number;
  name: string;
  description: string;
  model: string;
  device_pool_id: number;
  device_pool_name: string;
  cm_group_name: string;
}

export interface PhonesResponse {
  phones: Phone[];
  total: number;
  limit: number;
  offset: number;
}

export interface RegStat {
  server_name: string | null;
  status: string;
  count: number;
}

export interface PollStatus {
  lastPollTime: string | null;
  pollInProgress: boolean;
  intervalMinutes: number;
}

export interface FailoverEntry {
  cm_group_name: string;
  registered_server: string;
  primary_server: string;
  registered_priority: number | null;
  count: number;
}

export interface FailoverDetail {
  phone_name: string;
  model: string;
  device_pool_name: string;
  cm_group_name: string;
  ip_address: string;
  registered_server: string;
  primary_server: string;
  registered_priority: number | null;
}

export interface PhoneMovement {
  phoneName: string;
  currentServer: string | null;
  newServer: string | null;
  impact: "no_change" | "re_register" | "unregistered";
  ipAddress?: string;
  subnetName?: string;
}

export interface SubnetImpact {
  subnetName: string;
  cidr: string;
  totalPhones: number;
  noImpact: number;
  willReRegister: number;
  unregistered: number;
}

export interface SimulationDetail {
  cmGroupName: string;
  cmGroupId: number;
  totalPhones: number;
  noImpact: number;
  willReRegister: number;
  unregistered: number;
  movements: PhoneMovement[];
  subnetImpacts?: SubnetImpact[];
}

export interface Subnet {
  id: number;
  cidr: string;
  name: string;
  description: string;
}

export interface SubnetDistribution {
  subnets: {
    subnetId: number;
    subnetName: string;
    cidr: string;
    count: number;
    cmGroups: Record<string, number>;
  }[];
  unmapped: number;
  unmappedCmGroups: Record<string, number>;
  totalPhones: number;
}

export interface AvailabilityGroup {
  label: string;
  servers: string[];
  cmgNames: string[];
  phoneCount: number;
}

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
  agLabels: string[];
  notes: string[];
  estimatedMinutes: { min: number; max: number };
}

export interface ParallelGroup {
  groupNumber: number;
  steps: UpgradeStep[];
  combinedReRegistering: number;
  combinedUnregistered: number;
  estimatedMinutes: { min: number; max: number };
  agLabels: string[];
  notes: string[];
}

export interface UpgradeAnalysis {
  totalSteps: number;
  totalServers: number;
  steps: UpgradeStep[];
  parallelGroups: ParallelGroup[];
  availabilityGroups: AvailabilityGroup[];
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

export interface DevicePoolInfo {
  id: number;
  name: string;
  cm_group_name: string;
  phone_count: number;
}

export interface DevicePoolBreakdown {
  totalPhones: number;
  serverDistribution: { server_name: string; count: number }[];
  subnetDistribution: { name: string; cidr: string; count: number }[];
  unmappedSubnet: number;
  modelDistribution: { model: string; count: number }[];
  failoverMovements: { currentServer: string; backupServer: string | null; phoneCount: number }[];
  cmGroupName: string | null;
}

export interface PlannerServerLoad {
  serverName: string;
  phoneCount: number;
  cmgs: string[];
  agLabels: string[];
}

export interface PlannerGeoZone {
  name: string;
  subnetCidrs: string[];
  phoneCount: number;
  currentCmg: string;
  assignedCmg: string;
  primaryServer: string;
  agLabel: string;
}

export interface PhoneStats {
  totalPhones: number;
  registeredPhones: number;
  unregisteredPhones: number;
  neverSeenPhones: number;
  stalePhones: number;
}

export interface PlannerResult {
  currentState: {
    serverLoads: PlannerServerLoad[];
    imbalanceRatio: number;
  };
  proposedState: {
    serverLoads: PlannerServerLoad[];
    imbalanceRatio: number;
  };
  geoZones: PlannerGeoZone[];
  unmappedPhones: number;
  totalPhones: number;
  phoneStats: PhoneStats;
  rebalanceCmgIds: number[];
  lockedCmgIds: number[];
  allCmgs: { id: number; name: string; phoneCount: number; ccmActive: boolean }[];
}

export interface Trunk {
  id: number;
  name: string;
  description: string;
  device_pool_name: string;
  cm_group_name: string;
}

export interface TrunksResponse {
  trunks: Trunk[];
  total: number;
}

export interface TrunkRegistration {
  trunk_name: string;
  description: string;
  server_name: string;
  device_pool_name: string;
  cm_group_name: string;
  status: string;
  ip_address: string;
}

export interface TrunkMovement {
  trunkName: string;
  description: string;
  currentServer: string | null;
  newServer: string | null;
  impact: "no_change" | "re_register" | "no_service";
  devicePoolName: string;
  cmGroupName: string;
}

export interface TrunkImpact {
  totalTrunks: number;
  noImpact: number;
  willReRegister: number;
  noService: number;
  movements: TrunkMovement[];
}

export interface Gateway {
  id: number;
  name: string;
  description: string;
  domain_name: string;
  device_pool_name: string;
  cm_group_name: string;
}

export interface GatewaysResponse {
  gateways: Gateway[];
  total: number;
}

export interface GatewayRegistration {
  gateway_name: string;
  description: string;
  domain_name: string;
  server_name: string;
  device_pool_name: string;
  cm_group_name: string;
  status: string;
  ip_address: string;
}

export interface GatewaySummary {
  id: number;
  gateway_name: string;
  description: string;
  domain_name: string;
  device_pool_name: string;
  cm_group_name: string;
  registered_count: number;
  registered_servers: string | null;
}

export interface FeatureFlags {
  enableGateways: boolean;
  [key: string]: boolean;
}

export interface GatewayMovement {
  gatewayName: string;
  description: string;
  domainName: string;
  devicePoolName: string;
  cmGroupName: string;
  currentCount: number;
  newCount: number;
  impact: "no_change" | "degraded" | "no_service";
}

export interface GatewayImpact {
  totalGateways: number;
  noImpact: number;
  degraded: number;
  noService: number;
  movements: GatewayMovement[];
}

export interface SimulationResult {
  totalPhones: number;
  noImpact: number;
  willReRegister: number;
  unregistered: number;
  details: SimulationDetail[];
  trunkImpact?: TrunkImpact;
  gatewayImpact?: GatewayImpact;
}

export const api = {
  getServers: () => get<Server[]>("/api/servers"),
  getCmGroups: () => get<CmGroup[]>("/api/cmgroups"),
  getPhones: (limit = 100, offset = 0) =>
    get<PhonesResponse>(`/api/phones?limit=${limit}&offset=${offset}`),
  getRegStats: () => get<RegStat[]>("/api/registrations/stats"),
  getFailoverStatus: () => get<FailoverEntry[]>("/api/registrations/failover"),
  getFailoverDetails: () => get<FailoverDetail[]>("/api/registrations/failover/details"),
  getPollStatus: () => get<PollStatus>("/api/poll/status"),
  triggerPoll: () => post<{ ok: boolean; message: string }>("/api/poll/trigger"),
  simulate: (disabledServerIds: number[]) =>
    post<SimulationResult>("/api/simulate", { disabledServerIds }),
  sync: () => post<{ servers: number; cmGroups: number; devicePools: number; phones: number }>("/api/sync"),

  // Subnets
  getSubnets: () => get<Subnet[]>("/api/subnets"),
  createSubnet: (cidr: string, name: string, description = "") =>
    post<Subnet>("/api/subnets", { cidr, name, description }),
  updateSubnet: (id: number, cidr: string, name: string, description = "") =>
    put<{ ok: boolean }>(`/api/subnets/${id}`, { cidr, name, description }),
  deleteSubnet: (id: number) => del<{ ok: boolean }>(`/api/subnets/${id}`),
  getSubnetDistribution: () => get<SubnetDistribution>("/api/subnets/distribution"),
  discoverSubnets: () =>
    get<{ discovered: { cidr: string; count: number; suggestedName: string }[]; totalUnmapped: number }>("/api/subnets/discover"),
  bulkCreateSubnets: (subnets: { cidr: string; name: string }[]) =>
    post<{ created: number; skipped: number; errors: string[] }>("/api/subnets/discover", { subnets }),
  parseSubnetMasks: (text: string) =>
    post<{ discovered: { cidr: string; count: number; suggestedName: string }[]; totalParsed: number }>("/api/subnets/parse-masks", { text }),
  scrapePreview: (all = false) =>
    get<{ total: number; byModel: Record<string, number> }>(`/api/subnets/scrape/preview${all ? "?all=true" : ""}`),
  scrapePhones: (rescrapeAll = false) =>
    post<{ ok: boolean; message: string }>("/api/subnets/scrape", { rescrapeAll }),
  scrapeProgress: () =>
    get<{ total: number; completed: number; found: number; errors: number; status: string }>("/api/subnets/scrape/progress"),

  // Device Pools
  getDevicePools: (model?: string) =>
    get<DevicePoolInfo[]>(`/api/devicepools${model ? `?model=${encodeURIComponent(model)}` : ""}`),
  getDevicePoolBreakdown: (id: number, model?: string) =>
    get<DevicePoolBreakdown>(`/api/devicepools/${id}/breakdown${model ? `?model=${encodeURIComponent(model)}` : ""}`),
  getPhoneModels: () =>
    get<{ model: string; count: number }[]>("/api/devicepools/models"),

  // Planner
  getPlanner: (cmgIds?: number[]) =>
    get<PlannerResult>(`/api/planner${cmgIds ? `?cmgs=${cmgIds.join(",")}` : ""}`),

  // Upgrade Analyzer
  getUpgradeAnalysis: () => get<UpgradeAnalysis>("/api/upgrade"),

  // Trunks
  getTrunks: () => get<TrunksResponse>("/api/trunks"),
  getTrunkRegistrations: () => get<TrunkRegistration[]>("/api/trunks/registrations"),
  getTrunkStats: () =>
    get<{ server_name: string; status: string; count: number }[]>("/api/trunks/stats"),

  // Availability Groups
  getAvailabilityGroups: () => get<AvailabilityGroup[]>("/api/ag"),

  // Feature Flags
  getFeatures: () => get<FeatureFlags>("/api/features"),

  // Gateways
  getGateways: () => get<GatewaysResponse>("/api/gateways"),
  getGatewayRegistrations: () => get<GatewayRegistration[]>("/api/gateways/registrations"),
  getGatewayStats: () =>
    get<{ server_name: string; status: string; count: number }[]>("/api/gateways/stats"),
  getGatewaySummary: () => get<GatewaySummary[]>("/api/gateways/summary"),
};
