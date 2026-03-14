import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import Dashboard from "./pages/Dashboard";
import Simulation from "./pages/Simulation";
import Subnets from "./pages/Subnets";
import Upgrade from "./pages/Upgrade";
import Firmware from "./pages/Firmware";
import Planner from "./pages/Planner";
import Trunks from "./pages/Trunks";

const SOCKET_URL = import.meta.env.DEV ? "http://localhost:3000" : "";

type Page = "dashboard" | "simulation" | "subnets" | "upgrade" | "firmware" | "planner" | "trunks";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on("registration:updated", () => {
      setRefreshKey((k) => k + 1);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div className="min-h-screen bg-noc-bg">
      {/* Top Nav Bar */}
      <header className="sticky top-0 z-50 border-b border-noc-border bg-noc-bg/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-12 lg:px-20 flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            {/* Logo / Title */}
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-noc-amber"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
              </svg>
              <span className="font-mono text-sm font-semibold text-noc-text-bright tracking-wide">
                CUCM<span className="text-noc-amber">//</span>AVAIL
              </span>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex items-center gap-1">
            <NavTab
              label="Dashboard"
              active={page === "dashboard"}
              onClick={() => setPage("dashboard")}
            />
            <NavTab
              label="Simulation"
              active={page === "simulation"}
              onClick={() => setPage("simulation")}
            />
            <NavTab
              label="Subnets"
              active={page === "subnets"}
              onClick={() => setPage("subnets")}
            />
            <NavTab
              label="Firmware"
              active={page === "firmware"}
              onClick={() => setPage("firmware")}
            />
            <NavTab
              label="Planner"
              active={page === "planner"}
              onClick={() => setPage("planner")}
            />
            <NavTab
              label="Trunks"
              active={page === "trunks"}
              onClick={() => setPage("trunks")}
            />
            <NavTab
              label="Upgrade"
              active={page === "upgrade"}
              onClick={() => setPage("upgrade")}
            />
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-12 lg:px-20 py-10" key={refreshKey}>
        {page === "dashboard" ? (
          <Dashboard />
        ) : page === "simulation" ? (
          <Simulation />
        ) : page === "subnets" ? (
          <Subnets />
        ) : page === "firmware" ? (
          <Firmware />
        ) : page === "planner" ? (
          <Planner />
        ) : page === "trunks" ? (
          <Trunks />
        ) : (
          <Upgrade />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-noc-border/50 mt-auto">
        <div className="max-w-7xl mx-auto px-12 lg:px-20 py-4 flex items-center justify-between">
          <span className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest">
            CUCM Availability Monitor v1.0
          </span>
          <span className="font-mono text-[10px] text-noc-text-dim">
            Polling every 15 min
          </span>
        </div>
      </footer>
    </div>
  );
}

function NavTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2 rounded font-mono text-xs uppercase tracking-widest transition-all cursor-pointer ${
        active
          ? "bg-noc-amber/10 text-noc-amber border border-noc-amber/20"
          : "text-noc-text-dim hover:text-noc-text border border-transparent"
      }`}
    >
      {label}
    </button>
  );
}

export default App;
