import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Server } from "../api/client";
import SimulationPanel from "../components/SimulationPanel";

export default function Simulation() {
  const [servers, setServers] = useState<Server[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .getServers()
      .then(setServers)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading servers...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold text-noc-text-bright">
          Failover Simulation
        </h1>
        <p className="text-sm text-noc-text-dim mt-1">
          Model the impact of server failures on phone registrations across CMG groups.
        </p>
      </div>
      <SimulationPanel servers={servers} />
    </div>
  );
}
