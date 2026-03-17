import controlCenterService from "cisco-serviceability";
import { config } from "../config.js";

// Friendly display names for known services
export const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  "Cisco CallManager": "CallManager",
  "Cisco Extension Mobility": "Extension Mobility",
  "Cisco CTIManager": "CTI Manager",
  "Cisco Tftp": "TFTP",
  "Cisco IP Voice Media Streaming App": "Media Resources",
  "Cisco AXL Web Service": "AXL",
  "Cisco Bulk Provisioning Service": "Bulk Provisioning",
  "Cisco CAR Web Service": "CAR",
  "Cisco Certificate Authority Proxy Function": "CAPF",
  "Cisco Certificate Enrollment Service": "CES",
  "Cisco DirSync": "DirSync",
  "Cisco Dialed Number Analyzer Server": "DNA Server",
  "Cisco Dialed Number Analyzer": "DNA",
  "Cisco Extended Functions": "Extended Functions",
  "Cisco High Availability": "High Availability",
  "Cisco IP Manager Assistant": "IPMA",
  "Cisco Log Partition Monitoring Tool": "Log Monitor",
  "Cisco Messaging Interface": "Messaging Interface",
  "Cisco RIS Data Collector": "RIS Collector",
  "Cisco Serviceability Reporter": "Reporter",
  "Cisco SOAP - CDRonDemand Service": "CDR on Demand",
  "Cisco SOAP - Log Collection APIs": "Log Collection",
  "Cisco SOAP - Performance Monitoring APIs": "PerfMon",
  "Cisco SOAP - Real-Time Service APIs": "RealTime API",
  "Cisco Tomcat": "Tomcat",
  "Cisco Trace Collection Service": "Trace Collection",
  "Cisco Trace Collection Servlet": "Trace Servlet",
  "Cisco Trust Verification Service": "Trust Verification",
  "Cisco UXL Web Service": "UXL",
  "Cisco WebDialer Web Service": "WebDialer",
  "Platform Administrative Web Service": "Platform Admin",
};

export interface ServiceStatus {
  serverHostname: string;
  serviceName: string;
  status: string;
  reasonCode: string;
}

function getService(hostname: string) {
  return new controlCenterService(
    hostname,
    config.cucm.username,
    config.cucm.password
  );
}

function parseServiceItems(hostname: string, results: any): ServiceStatus[] {
  if (!results) return [];

  const items = results.ServiceInfoList?.item;
  if (!items) return [];

  const list = Array.isArray(items) ? items : [items];
  return list.map((item: any) => ({
    serverHostname: hostname,
    serviceName: item.ServiceName || "",
    status: item.ServiceStatus || "Unknown",
    reasonCode: item.ReasonCode || "",
  }));
}

export async function getCallManagerServiceStatus(
  hostname: string
): Promise<ServiceStatus> {
  try {
    const svc = getService(hostname);
    const { results } = await svc.getServiceStatus("Cisco CallManager");
    const statuses = parseServiceItems(hostname, results);
    return statuses[0] || {
      serverHostname: hostname,
      serviceName: "Cisco CallManager",
      status: "Unknown",
      reasonCode: "",
    };
  } catch (err) {
    return {
      serverHostname: hostname,
      serviceName: "Cisco CallManager",
      status: "Error",
      reasonCode: (err as Error).message,
    };
  }
}

export async function checkAllServersServiceStatus(
  hostnames: string[]
): Promise<ServiceStatus[]> {
  const results = await Promise.allSettled(
    hostnames.map((h) => getCallManagerServiceStatus(h))
  );

  return results.map((r, i) => {
    if (r.status === "fulfilled") {
      return r.value;
    }
    return {
      serverHostname: hostnames[i],
      serviceName: "Cisco CallManager",
      status: "Error",
      reasonCode: (r.reason as Error).message,
    };
  });
}

/**
 * Query ALL services on ALL servers. One call per server returns
 * every service and its status.
 */
export async function checkAllServicesOnAllServers(
  hostnames: string[]
): Promise<ServiceStatus[]> {
  const allResults: ServiceStatus[] = [];

  const results = await Promise.allSettled(
    hostnames.map(async (hostname) => {
      const svc = getService(hostname);
      const { results } = await svc.getServiceStatus();
      return parseServiceItems(hostname, results);
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      allResults.push(...r.value);
    } else {
      allResults.push({
        serverHostname: hostnames[i],
        serviceName: "ALL",
        status: "Error",
        reasonCode: (r.reason as Error).message,
      });
    }
  }

  return allResults;
}
