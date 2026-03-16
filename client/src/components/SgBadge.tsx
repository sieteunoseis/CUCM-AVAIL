import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { ServiceGroup } from "../api/client";

const SG_COLORS: Record<string, { bg: string; text: string }> = {
  "SG-1": { bg: "bg-noc-cyan/10", text: "text-noc-cyan" },
  "SG-2": { bg: "bg-noc-amber/10", text: "text-noc-amber" },
  "SG-3": { bg: "bg-noc-green/10", text: "text-noc-green" },
  "SG-4": { bg: "bg-noc-blue/10", text: "text-noc-blue" },
  "SG-5": { bg: "bg-noc-red/10", text: "text-noc-red" },
  "SG-6": { bg: "bg-purple-500/10", text: "text-purple-400" },
  "SG-7": { bg: "bg-pink-500/10", text: "text-pink-400" },
  "SG-8": { bg: "bg-orange-500/10", text: "text-orange-400" },
  "SG-9": { bg: "bg-teal-500/10", text: "text-teal-400" },
  "SG-10": { bg: "bg-indigo-500/10", text: "text-indigo-400" },
};

export function SgBadge({ label }: { label: string }) {
  const c = SG_COLORS[label] || { bg: "bg-noc-border", text: "text-noc-text-dim" };
  return (
    <span className={`inline-block px-2 py-0.5 text-[11px] font-mono font-semibold ${c.bg} ${c.text}`}>
      {label}
    </span>
  );
}

export function getSgColor(label: string) {
  return SG_COLORS[label] || { bg: "bg-noc-border", text: "text-noc-text-dim" };
}

/**
 * Hook to fetch SG data and build lookup maps.
 * Returns SG list, service→SG map, and server→SG[] map.
 */
export function useServiceGroups() {
  const [sgs, setSgs] = useState<ServiceGroup[]>([]);
  const [serviceToSg, setServiceToSg] = useState<Map<string, string>>(new Map());
  const [serverToSgs, setServerToSgs] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    api.getServiceGroups().then((data) => {
      setSgs(data);
      const svcMap = new Map<string, string>();
      const srvMap = new Map<string, string[]>();
      for (const sg of data) {
        for (const svc of sg.services) {
          svcMap.set(svc, sg.label);
        }
        for (const srv of sg.servers) {
          const short = srv.split(".")[0];
          if (!srvMap.has(short)) srvMap.set(short, []);
          if (!srvMap.get(short)!.includes(sg.label)) {
            srvMap.get(short)!.push(sg.label);
          }
        }
      }
      setServiceToSg(svcMap);
      setServerToSgs(srvMap);
    }).catch(console.error);
  }, []);

  return { sgs, serviceToSg, serverToSgs };
}
