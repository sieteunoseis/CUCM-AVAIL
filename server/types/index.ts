export interface CucmServer {
  id?: number;
  name: string;
  hostname: string;
  nodeType: string;
  ccmServiceActive: boolean;
  lastCheckedAt?: string;
}

export interface CmGroup {
  id?: number;
  name: string;
  members: CmGroupMember[];
}

export interface CmGroupMember {
  serverName: string;
  serverId?: number;
  priority: number;
}

export interface DevicePool {
  id?: number;
  name: string;
  cmGroupName: string;
  cmGroupId?: number;
}

export interface Phone {
  id?: number;
  name: string;
  description: string;
  model: string;
  devicePoolId?: number;
  devicePoolName?: string;
  cmGroupName?: string;
}

export interface RegistrationSnapshot {
  id?: number;
  phoneId: number;
  registeredServerId: number | null;
  registeredServerName?: string;
  status: string;
  ipAddress: string;
  polledAt?: string;
}

export interface SimulationRequest {
  disabledServerIds: number[];
}

export interface ServiceImpact {
  serviceName: string;
  displayName: string;
  sgLabel: string;
  currentActive: number;
  newActive: number;
  totalServers: number;
  impact: "no_change" | "degraded" | "outage";
}

export interface SimulationResult {
  totalPhones: number;
  noImpact: number;
  willReRegister: number;
  unregistered: number;
  details: SimulationDetail[];
  trunkImpact?: TrunkImpact;
  gatewayImpact?: GatewayImpact;
  serviceImpacts?: ServiceImpact[];
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

export interface PhoneImpact {
  phoneName: string;
  model: string;
  devicePoolName: string;
  cmGroupName: string;
  currentServer: string | null;
  newServer: string | null;
  impact: "no_change" | "re_register" | "unregistered";
}

export interface PhoneStatusMember {
  priority: number;
  serverId: number;
  serverName: string;
  hostname: string;
  ccmServiceActive: boolean;
}

export interface PhoneStatus {
  phoneName: string;
  model: string;
  devicePoolName: string;
  cmGroupName: string;
  members: PhoneStatusMember[];
  registeredServer: string | null;
  registrationStatus: string | null;
  ipAddress: string | null;
  lastSeenAt: string | null;
  lastActiveAt: string | null;
  /** ok = on its priority-1 server; on_backup = registered but not on priority-1; down = not registered / priority-1 server (or all members) unreachable */
  health: "ok" | "on_backup" | "down";
}
