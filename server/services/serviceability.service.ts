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

// SOAP envelope that queries ALL services (empty ServiceStatus tag)
const SOAP_ALL_SERVICES = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:soap="http://schemas.cisco.com/ast/soap">
  <soapenv:Body>
    <soap:soapGetServiceStatus>
      <soap:ServiceStatus></soap:ServiceStatus>
    </soap:soapGetServiceStatus>
  </soapenv:Body>
</soapenv:Envelope>`;

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

async function queryServiceability(
  hostname: string,
  soapBody: string
): Promise<string> {
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
    body: soapBody,
  });

  return response.text();
}

/**
 * Parse all ServiceInfoList items from the SOAP response.
 * Each item has ServiceName, ServiceStatus, and ReasonCode.
 */
function parseAllServices(hostname: string, xml: string): ServiceStatus[] {
  const results: ServiceStatus[] = [];

  // Match each ServiceInfoList item
  const itemRegex = /<ns1:item>([\s\S]*?)<\/ns1:item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const nameMatch = item.match(/<ns1:ServiceName>(.*?)<\/ns1:ServiceName>/);
    const statusMatch = item.match(/<ns1:ServiceStatus>(.*?)<\/ns1:ServiceStatus>/);
    const reasonMatch = item.match(/<ns1:ReasonCode>(.*?)<\/ns1:ReasonCode>/);

    if (nameMatch) {
      results.push({
        serverHostname: hostname,
        serviceName: nameMatch[1],
        status: statusMatch ? statusMatch[1] : "Unknown",
        reasonCode: reasonMatch ? reasonMatch[1] : "",
      });
    }
  }

  return results;
}

export async function getCallManagerServiceStatus(
  hostname: string
): Promise<ServiceStatus> {
  const xml = await queryServiceability(hostname, buildSoapEnvelope("Cisco CallManager"));

  const serviceStatusMatch = xml.match(
    /<ns1:ServiceStatus>(.*?)<\/ns1:ServiceStatus>/
  );
  const statusValue = serviceStatusMatch ? serviceStatusMatch[1] : "Unknown";

  const reasonCodeMatch = xml.match(
    /<ns1:ReasonCode>(.*?)<\/ns1:ReasonCode>/
  );
  const reasonCode = reasonCodeMatch ? reasonCodeMatch[1] : "";

  return {
    serverHostname: hostname,
    serviceName: "Cisco CallManager",
    status: statusValue,
    reasonCode,
  };
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
 * Query ALL services on ALL servers. One SOAP call per server returns
 * every service and its status.
 */
export async function checkAllServicesOnAllServers(
  hostnames: string[]
): Promise<ServiceStatus[]> {
  const allResults: ServiceStatus[] = [];

  const results = await Promise.allSettled(
    hostnames.map(async (hostname) => {
      const xml = await queryServiceability(hostname, SOAP_ALL_SERVICES);
      return parseAllServices(hostname, xml);
    })
  );

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled") {
      allResults.push(...r.value);
    } else {
      // If we can't reach a server, record an error for it
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
