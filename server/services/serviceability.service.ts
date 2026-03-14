import { config } from "../config.js";

const SOAP_ENVELOPE = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:soap="http://schemas.cisco.com/ast/soap">
  <soapenv:Body>
    <soap:soapGetServiceStatus>
      <soap:ServiceStatus>Cisco CallManager</soap:ServiceStatus>
    </soap:soapGetServiceStatus>
  </soapenv:Body>
</soapenv:Envelope>`;

export interface ServiceStatus {
  serverHostname: string;
  serviceName: string;
  status: string;
  reasonCode: string;
}

export async function getCallManagerServiceStatus(
  hostname: string
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
    body: SOAP_ENVELOPE,
  });

  const text = await response.text();

  // Response uses ns1: prefix — match ServiceStatus within ServiceInfoList items
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
