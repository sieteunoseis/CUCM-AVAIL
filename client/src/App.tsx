import { useState, useEffect } from "react";
import { io } from "socket.io-client";
import { api } from "./api/client";
import type { PollStatus } from "./api/client";
import Dashboard from "./pages/Dashboard";
import Simulation from "./pages/Simulation";
import Subnets from "./pages/Subnets";
import Upgrade from "./pages/Upgrade";
import Firmware from "./pages/Firmware";
import AvailabilityGroups from "./pages/AvailabilityGroups";
import Planner from "./pages/Planner";
import Trunks from "./pages/Trunks";
import Help from "./pages/Help";

const SOCKET_URL = import.meta.env.DEV ? "http://localhost:3000" : "";

type Page = "dashboard" | "ag" | "simulation" | "subnets" | "upgrade" | "firmware" | "planner" | "trunks" | "help";

const PAGES: { key: Page; label: string }[] = [
  { key: "dashboard", label: "dashboard" },
  { key: "ag", label: "avail groups" },
  { key: "simulation", label: "simulation" },
  { key: "subnets", label: "subnets" },
  { key: "firmware", label: "firmware" },
  { key: "planner", label: "planner" },
  { key: "trunks", label: "trunks" },
  { key: "upgrade", label: "upgrade" },
  { key: "help", label: "help" },
];

function useTheme() {
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("cucm-theme") as "dark" | "light") || "dark";
    }
    return "dark";
  });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("cucm-theme", theme);
  }, [theme]);

  const toggle = () => setTheme((t) => (t === "dark" ? "light" : "dark"));
  return { theme, toggle };
}

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const [clock, setClock] = useState(new Date());
  const [pollerLog, setPollerLog] = useState<string>("");
  const [logExpanded, setLogExpanded] = useState(false);
  const [logHistory, setLogHistory] = useState<string[]>([]);
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null);
  const [scrapeProgress, setScrapeProgress] = useState<{ total: number; completed: number; found: number; errors: number; status: string } | null>(null);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    api.getPollStatus().then(setPollStatus).catch(() => {});
    const socket = io(SOCKET_URL);
    socket.on("registration:updated", () => {
      setRefreshKey((k) => k + 1);
      api.getPollStatus().then(setPollStatus).catch(() => {});
    });
    socket.on("poller:log", (message: string) => {
      setPollerLog(message);
      setLogHistory((prev) => [...prev.slice(-49), message]);
    });
    socket.on("scrape:progress", (p: { total: number; completed: number; found: number; errors: number; status: string }) => {
      setScrapeProgress(p.status === "idle" ? null : p);
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  // Live clock for status bar
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-noc-bg flex flex-col">
      {/* ─── tmux window list bar ─── */}
      <header className="sticky top-0 z-50 border-b border-noc-border-bright bg-noc-panel flex items-center h-7 shrink-0">
        <span className="tmux-status-section text-noc-green font-semibold border-r border-noc-border">
          cucm-avail
        </span>
        <nav className="flex items-center overflow-x-auto flex-1">
          {PAGES.map((p, i) => (
            <button
              key={p.key}
              onClick={() => setPage(p.key)}
              className={`tmux-tab ${page === p.key ? "active" : "text-noc-text-dim"}`}
            >
              {i}:{p.label}{page === p.key ? "*" : ""}
            </button>
          ))}
        </nav>
        <div className="flex items-center h-full border-l border-noc-border">
          <button
            onClick={toggleTheme}
            className="theme-toggle mx-1.5"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? (
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            ) : (
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
          <span className="tmux-status-section text-noc-text-dim">
            <svg
              className="w-3.5 h-3.5 text-noc-amber mr-1.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            CUCM<span className="text-noc-amber mx-0.5">//</span>AVAIL
          </span>
        </div>
      </header>

      {/* ─── Main Content ─── */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-3 lg:px-5 py-3" key={refreshKey}>
        {page === "dashboard" ? (
          <Dashboard />
        ) : page === "ag" ? (
          <AvailabilityGroups />
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
        ) : page === "help" ? (
          <Help />
        ) : (
          <Upgrade />
        )}
      </main>

      {/* ─── Poller log panel (expandable) ─── */}
      {logExpanded && logHistory.length > 0 && (
        <div className="border-t border-noc-border bg-noc-bg/95 max-h-48 overflow-y-auto font-mono text-[10px] text-noc-text-dim">
          {logHistory.map((line, i) => (
            <div key={i} className="px-3 py-0.5 border-b border-noc-border/20 hover:bg-noc-panel/30">
              {line}
            </div>
          ))}
        </div>
      )}

      {/* ─── tmux status bar ─── */}
      <footer className="sticky bottom-0 z-50 border-t border-noc-border-bright bg-noc-panel h-6 flex items-center justify-between shrink-0">
        <div className="flex items-center h-full">
          <span className="tmux-status-section bg-noc-green/15 text-noc-green font-semibold uppercase tracking-widest gap-1.5">
            <span className="w-1.5 h-1.5 bg-noc-green animate-pulse-green" />
            online
          </span>
          <span className="tmux-status-section text-noc-text-dim border-l border-noc-border">
            poll {pollStatus ? (pollStatus.intervalMinutes >= 1440 ? "daily" : pollStatus.intervalMinutes >= 60 ? `q${Math.round(pollStatus.intervalMinutes / 60)}h` : `q${pollStatus.intervalMinutes}m`) : "—"}
          </span>
          {scrapeProgress && scrapeProgress.status !== "idle" && (
            <span className="tmux-status-section text-noc-amber border-l border-noc-border">
              <span className={`w-1.5 h-1.5 ${scrapeProgress.status === "running" ? "bg-noc-amber animate-pulse" : "bg-noc-green"} mr-1`} />
              scrape {scrapeProgress.completed}/{scrapeProgress.total} ({scrapeProgress.found} found{scrapeProgress.errors > 0 ? `, ${scrapeProgress.errors} err` : ""})
              {scrapeProgress.status === "done" && " done"}
            </span>
          )}
          {pollerLog && (
            <button
              onClick={() => setLogExpanded((v) => !v)}
              className="tmux-status-section text-noc-cyan border-l border-noc-border cursor-pointer hover:bg-noc-panel/80 transition-colors truncate max-w-xs"
              title="Click to expand/collapse poller log"
            >
              {pollerLog}
            </button>
          )}
        </div>
        <div className="flex items-center h-full">
          <span className="tmux-status-section text-noc-text-dim border-r border-noc-border">
            {page}
          </span>
          <span className="tmux-status-section bg-noc-amber/10 text-noc-amber font-semibold tabular-nums">
            {clock.toLocaleTimeString()}
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
