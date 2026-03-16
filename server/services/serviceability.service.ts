import { config } from "../config.js";

// Customer-facing services we track
export const TRACKED_SERVICES = [
  "Cisco CallManager",
  "Cisco Extension Mobility",
  "Cisco CTIManager",
  "Cisco Tftp",
  "Cisco IP Voice Media Streaming App",
  "Cisco AXL Web Service",
];

// Friendly display names
export const SERVICE_DISPLAY_NAMES: Record<string, string> = {
  "Cisco CallManager": "CallManager",
  "Cisco Extension Mobility": "Extension Mobility",
  "Cisco CTIManager": "CTI Manager",
  "Cisco Tftp": "TFTP",
  "Cisco IP Voice Media Streaming App": "MOH",
  "Cisco AXL Web Service": "AXL",
};

function buildSoapEnvelope(serviceName: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:soap="http://schemas.cisco.com/ast/soap">
  <soapenv:Body>
    <soap:soapGetServiceStatus>
      <soap:ServiceStatus>${serviceName}</soap:ServiceStatus>
    </soap:soapGetServiceStatus>
  </soapenv:Body>
</soapenv:Envelope>`;
}

export interface ServiceStatus {
  serverHostname: string;
  serviceName: string;
  status: string;
  reasonCode: string;
}

async function getServiceStatus(
  hostname: string,
  serviceName: string
): Promise<ServiceStatus> {
  const url = `https://${hostname}:8443/controlcenterservice2/services/ControlCenterServices`;
  const auth = Buffer.from(
    `${config.cucm.username}:${config.cucm.password}`
  ).toString("base64");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      Authorization: `Basic ${auth}`,
      SOAPAction: `"ControlCenterServices#soapGetServiceStatus"`,
    },
    body: buildSoapEnvelope(serviceName),
  });

  const text = await response.text();

  const serviceStatusMatch = text.match(
    /<ns1:ServiceStatus>(.*?)<\/ns1:ServiceStatus>/
  );
  const statusValue = serviceStatusMatch ? serviceStatusMatch[1] : "Unknown";

  const reasonCodeMatch = text.match(
    /<ns1:ReasonCode>(.*?)<\/ns1:ReasonCode>/
  );
  const reasonCode = reasonCodeMatch ? reasonCodeMatch[1] : "";

  return {
    serverHostname: hostname,
    serviceName,
    status: statusValue,
    reasonCode,
  };
}

export async function getCallManagerServiceStatus(
  hostname: string
): Promise<ServiceStatus> {
  return getServiceStatus(hostname, "Cisco CallManager");
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
 * Check all tracked services on all servers.
 * Returns one ServiceStatus per (server, service) pair.
 */
export async function checkAllServicesOnAllServers(
  hostnames: string[]
): Promise<ServiceStatus[]> {
  const allResults: ServiceStatus[] = [];

  // Query each service across all servers in parallel
  for (const serviceName of TRACKED_SERVICES) {
    const results = await Promise.allSettled(
      hostnames.map((h) => getServiceStatus(h, serviceName))
    );

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r.status === "fulfilled") {
        allResults.push(r.value);
      } else {
        allResults.push({
          serverHostname: hostnames[i],
          serviceName,
          status: "Error",
          reasonCode: (r.reason as Error).message,
        });
      }
    }
  }

  return allResults;
}
