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
}

export interface ParallelGroup {
  groupNumber: number;
  steps: UpgradeStep[];
  combinedReRegistering: number;
  combinedUnregistered: number;
  estimatedMinutes: { min: number; max: number };
  notes: string[];
}

export interface UpgradeAnalysis {
  totalSteps: number;
  totalServers: number;
  steps: UpgradeStep[];
  parallelGroups: ParallelGroup[];
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
}

export interface PlannerServerLoad {
  serverName: string;
  phoneCount: number;
  cmgs: string[];
}

export interface PlannerGeoZone {
  name: string;
  subnetCidrs: string[];
  phoneCount: number;
  assignedCmg: string;
  primaryServer: string;
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

export interface SimulationResult {
  totalPhones: number;
  noImpact: number;
  willReRegister: number;
  unregistered: number;
  details: SimulationDetail[];
  trunkImpact?: TrunkImpact;
}

export const api = {
  getServers: () => get<Server[]>("/api/servers"),
  getCmGroups: () => get<CmGroup[]>("/api/cmgroups"),
  getPhones: (limit = 100, offset = 0) =>
    get<PhonesResponse>(`/api/phones?limit=${limit}&offset=${offset}`),
  getRegStats: () => get<RegStat[]>("/api/registrations/stats"),
  getPollStatus: () => get<PollStatus>("/api/poll/status"),
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

  // Device Pools
  getDevicePools: (model?: string) =>
    get<DevicePoolInfo[]>(`/api/devicepools${model ? `?model=${encodeURIComponent(model)}` : ""}`),
  getDevicePoolBreakdown: (id: number) =>
    get<DevicePoolBreakdown>(`/api/devicepools/${id}/breakdown`),
  getPhoneModels: () =>
    get<{ model: string; count: number }[]>("/api/devicepools/models"),

  // Planner
  getPlanner: () => get<PlannerResult>("/api/planner"),

  // Upgrade Analyzer
  getUpgradeAnalysis: () => get<UpgradeAnalysis>("/api/upgrade"),

  // Trunks
  getTrunks: () => get<TrunksResponse>("/api/trunks"),
  getTrunkRegistrations: () => get<TrunkRegistration[]>("/api/trunks/registrations"),
  getTrunkStats: () =>
    get<{ server_name: string; status: string; count: number }[]>("/api/trunks/stats"),
};
