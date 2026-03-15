import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { AvailabilityGroup } from "../api/client";

const AG_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  "AG-1": { bg: "bg-noc-cyan/10", text: "text-noc-cyan", dot: "bg-noc-cyan" },
  "AG-2": { bg: "bg-noc-amber/10", text: "text-noc-amber", dot: "bg-noc-amber" },
  "AG-3": { bg: "bg-noc-green/10", text: "text-noc-green", dot: "bg-noc-green" },
  "AG-4": { bg: "bg-noc-blue/10", text: "text-noc-blue", dot: "bg-noc-blue" },
  "AG-5": { bg: "bg-noc-red/10", text: "text-noc-red", dot: "bg-noc-red" },
  "AG-6": { bg: "bg-purple-500/10", text: "text-purple-400", dot: "bg-purple-400" },
};

export function AgBadge({ label }: { label: string }) {
  const c = AG_COLORS[label] || { bg: "bg-noc-border", text: "text-noc-text-dim", dot: "bg-noc-text-dim" };
  return (
    <span className={`inline-block px-2 py-0.5 text-[11px] font-mono font-semibold ${c.bg} ${c.text}`}>
      {label}
    </span>
  );
}

export function getAgColor(label: string) {
  return AG_COLORS[label] || { bg: "bg-noc-border", text: "text-noc-text-dim", dot: "bg-noc-text-dim" };
}

/**
 * Hook to fetch AG data and build lookup maps.
 * Returns AG list, CMG→AG map, and server→AG[] map.
 */
export function useAvailabilityGroups() {
  const [ags, setAgs] = useState<AvailabilityGroup[]>([]);
  const [cmgToAg, setCmgToAg] = useState<Map<string, string>>(new Map());
  const [serverToAgs, setServerToAgs] = useState<Map<string, string[]>>(new Map());

  useEffect(() => {
    api.getAvailabilityGroups().then((data) => {
      setAgs(data);
      const cmgMap = new Map<string, string>();
      const srvMap = new Map<string, string[]>();
      for (const ag of data) {
        for (const cmgName of ag.cmgNames) {
          cmgMap.set(cmgName, ag.label);
        }
        for (const srv of ag.servers) {
          if (!srvMap.has(srv)) srvMap.set(srv, []);
          srvMap.get(srv)!.push(ag.label);
        }
      }
      setCmgToAg(cmgMap);
      setServerToAgs(srvMap);
    }).catch(console.error);
  }, []);

  return { ags, cmgToAg, serverToAgs };
}
