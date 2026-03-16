import { useState } from "react";

interface Section {
  id: string;
  title: string;
  content: React.ReactNode;
}

const sections: Section[] = [
  {
    id: "overview",
    title: "Dashboard",
    content: (
      <div className="space-y-3">
        <p>The dashboard shows all CUCM subscriber and publisher nodes with their CCM service status, phone registrations, and failover state. Phones are polled via RISPort and matched to their registered server.</p>
        <div className="space-y-2">
          <H4>Node Cards</H4>
          <p>Each node card shows:</p>
          <ul className="list-none space-y-1 ml-2">
            <li><C>FQDN</C> — server hostname</li>
            <li><C>CCM SVC</C> — whether Cisco CallManager service is started</li>
            <li><C>PRIMARY FOR</C> — how many CMGs have this server as P1</li>
            <li><C>FAILOVER</C> — phones registered here that should be on a different server per CMG priority</li>
            <li><C>AG badge</C> — which Availability Group(s) the server belongs to</li>
          </ul>
        </div>
        <div className="space-y-2">
          <H4>Theme</H4>
          <p>Use the sun/moon toggle in the header bar to switch between dark and light themes. Your preference is saved across sessions.</p>
        </div>
      </div>
    ),
  },
  {
    id: "availability-groups",
    title: "Availability Groups",
    content: (
      <div className="space-y-3">
        <p>Availability Groups (AGs) visualize how CM Groups share servers. An AG is a unique set of servers — CMGs that use the exact same servers (regardless of priority order) belong to the same AG. AG labels appear throughout the app next to CMG and server names.</p>

        <div className="space-y-2">
          <H4>Priority Matrix</H4>
          <p>Servers across the top, CMGs down the side. Each cell shows the priority (P1, P2, P3) of that server in that CMG. Empty cells mean the CMG doesn't use that server. Columns are sortable.</p>
          <ul className="list-none space-y-1 ml-2">
            <li><Badge color="green">P1</Badge> — primary server (phones register here first)</li>
            <li><Badge color="cyan">P2</Badge> — first failover target</li>
            <li><span className="text-noc-text-dim">P3</span> — second failover target</li>
          </ul>
        </div>

        <div className="space-y-2">
          <H4>AG Numbering</H4>
          <p>CMGs that use the <em>exact same set of servers</em> (regardless of priority order) are grouped into the same AG. Each AG is color-coded and numbered by phone count (AG-1 has the most phones). Different AGs should ideally share zero servers — making them fully independent for upgrades and failover.</p>
        </div>

        <div className="space-y-2">
          <H4>Blast Zones</H4>
          <p>A blast zone is a group of AGs interconnected through shared servers. If you can trace a path from AG-1 to AG-4 through shared servers, they're in the same blast zone. If all your CMGs are in a single blast zone, every server failure has the potential to cascade.</p>
          <div className="border border-noc-border bg-noc-bg p-3 mt-2">
            <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-2">Capacity</div>
            <p className="text-xs">With N servers and M per CMG, you can have at most <strong>N ÷ M fully independent AGs</strong>.</p>
          </div>
        </div>

        <div className="space-y-2">
          <H4>Cross-AG Servers</H4>
          <p>A server that appears in more than one AG within a blast zone is a <span className="text-noc-red">cross-AG server</span>, marked with ⚠. These are shared failure points — if that server goes down, it impacts multiple AGs simultaneously.</p>
          <div className="border border-noc-red/20 bg-noc-red/5 p-3 mt-2">
            <div className="font-mono text-[10px] text-noc-red uppercase tracking-widest mb-2">Why this matters</div>
            <p className="text-xs">If two device pools are designed so phones sitting next to each other are on different CMGs (e.g. call center redundancy), those CMGs must be in AGs that share zero servers. Otherwise a single server failure could take out both halves of the room.</p>
          </div>
        </div>

        <div className="space-y-2">
          <H4>Upgrade Pairs</H4>
          <p>Compares every AG combination and classifies them as safe (0% server overlap) or unsafe (shared servers). Use the AG filter chips to narrow down to specific groups you care about.</p>
          <div className="border border-noc-green/20 bg-noc-green/5 p-3 mt-2 flex items-center gap-3">
            <span className="font-mono text-noc-green text-lg font-bold">0%</span>
            <p className="text-xs">A safe pair has completely disjoint server sets — you can upgrade one AG while the other continues operating.</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "simulation",
    title: "Failover Simulation",
    content: (
      <div className="space-y-3">
        <p>Toggle servers offline to model the impact on phone registrations. Servers are grouped by Availability Group with toggle switches. The stats row at the top updates live as you toggle servers.</p>
        <div className="space-y-2">
          <H4>Impact Categories</H4>
          <ul className="list-none space-y-1 ml-2">
            <li><Badge color="green">NO IMPACT</Badge> — phone's current server is still up</li>
            <li><Badge color="amber">RE-REGISTER</Badge> — phone will move to the next available server in CMG priority</li>
            <li><Badge color="red">UNREGISTERED</Badge> — all servers in the phone's CMG are disabled</li>
          </ul>
          <p>Already-unregistered phones are excluded — the simulation shows <em>additional</em> impact only.</p>
        </div>
        <div className="space-y-2">
          <H4>Per-CMG Breakdown</H4>
          <p>Each CMG row shows its AG badge, phone count, and impact. Expanding a row shows affected subnets with stacked bar charts and per-phone movement details.</p>
        </div>
        <div className="space-y-2">
          <H4>Trunk Impact</H4>
          <p>SIP trunks follow the same CMG failover logic. Trunks that lose all servers show as "NO SERVICE".</p>
        </div>
      </div>
    ),
  },
  {
    id: "subnets",
    title: "Subnet Management",
    content: (
      <div className="space-y-3">
        <p>The subnets page maps phone IP addresses to physical locations via CIDR-based subnet definitions. This powers the subnet views in simulation, firmware, and planner.</p>
        <div className="space-y-2">
          <H4>Phone Scraping</H4>
          <p>Phones with built-in web servers (Cisco 78xx, 88xx, 99xx, etc.) can be scraped for their subnet mask. Combined with their IP from RISPort, this calculates the CIDR and discovers subnets not yet defined.</p>
          <ul className="list-none space-y-1 ml-2">
            <li><C>Discovered</C> — new CIDRs not matching any existing subnet</li>
            <li><C>Updated</C> — existing subnets whose CIDR was corrected based on scrape data</li>
          </ul>
          <p>Scraping runs in the background. Progress shows in the status bar at the bottom.</p>
        </div>
      </div>
    ),
  },
  {
    id: "firmware",
    title: "Firmware Planner",
    content: (
      <div className="space-y-3">
        <p>Select a phone model and device pools to see the blast radius of a firmware push — which servers, subnets, and locations are affected.</p>
        <div className="space-y-2">
          <H4>Model Filtering</H4>
          <p>When a model is selected, all breakdowns (server distribution, subnet distribution, model distribution) are filtered to only that model's phones. Pool phone counts also reflect the filter.</p>
        </div>
        <div className="space-y-2">
          <H4>Failover Movement</H4>
          <p>Shows where phones would re-register if their current server went down during the firmware push. Based on the CMG priority list for each device pool.</p>
        </div>
      </div>
    ),
  },
  {
    id: "planner",
    title: "CMG Rebalance Planner",
    content: (
      <div className="space-y-3">
        <p>Analyzes registered phone distribution across CMGs and proposes a rebalanced assignment by subnet to minimize server load imbalance.</p>
        <div className="space-y-2">
          <H4>CMG Selection</H4>
          <p>Select which CMGs to include in the rebalance. By default all CCM-active CMGs with registered phones are selected. Deselected CMGs are "locked" — their subnets won't be reassigned.</p>
        </div>
        <div className="space-y-2">
          <H4>How It Works</H4>
          <p>Only registered phones (with an IP address) are counted. The engine groups phones by subnet, sorts subnets largest-first, and assigns each to the selected CMG with the fewest phones (greedy bin-packing). The result shows current vs proposed server loads and which subnets would move.</p>
        </div>
        <div className="space-y-2">
          <H4>Phone Stats</H4>
          <p>The top row shows phone breakdown: registered, unregistered, never seen (no registration snapshot), stale (last seen 7+ days ago), and unmapped (no matching subnet).</p>
        </div>
      </div>
    ),
  },
  {
    id: "trunks",
    title: "SIP Trunks",
    content: (
      <div className="space-y-3">
        <p>Real-time SIP trunk registration status from RISPort. The stats row at the top shows totals or per-server counts depending on which server is selected.</p>
        <div className="space-y-2">
          <H4>Server Filtering</H4>
          <p>Click a server chip to filter — the stats row, progress bar, and trunk table all update to show only that server's trunks. Click again or click "All" to see all servers.</p>
        </div>
        <div className="space-y-2">
          <H4>Status</H4>
          <ul className="list-none space-y-1 ml-2">
            <li><Badge color="green">FULL SERVICE</Badge> — trunk is registered and operational</li>
            <li><Badge color="amber">PARTIAL</Badge> — trunk is unregistered but may re-register</li>
            <li><Badge color="red">NO SERVICE</Badge> — trunk has no active registration</li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    id: "gateways",
    title: "MGCP Gateways",
    content: (
      <div className="space-y-3">
        <p>Real-time MGCP gateway and endpoint registration status from RISPort. Unlike phones and SIP trunks which register to a single server, MGCP gateways register their endpoints to <strong>up to 3 subscribers simultaneously</strong>. This page requires <C>ENABLE_GATEWAYS=true</C>.</p>
        <div className="space-y-2">
          <H4>Gateways View</H4>
          <p>One row per MGCP gateway showing its domain (FQDN), device pool, CMG, and a registration count badge:</p>
          <ul className="list-none space-y-1 ml-2">
            <li><Badge color="green">3/3</Badge> — endpoints registered to all 3 subscribers in its CMG (full service)</li>
            <li><Badge color="amber">1/3</Badge> or <Badge color="amber">2/3</Badge> — partial registration, some subscribers missing</li>
            <li><Badge color="red">0/3</Badge> — not registered to any subscriber</li>
          </ul>
          <p>The "Registered Servers" column shows which specific subscribers the gateway's endpoints are connected to.</p>
        </div>
        <div className="space-y-2">
          <H4>Endpoints View</H4>
          <p>One row per endpoint-server pair — the individual port/channel registrations on each gateway. Filter by server to see which endpoints are registered to a specific subscriber. Useful for verifying that all endpoints re-registered after a server restart or upgrade.</p>
        </div>
        <div className="space-y-2">
          <H4>Naming</H4>
          <p>MGCP endpoint names use the format <C>slot/subunit/port@hostname</C> — for example <C>S0/SU1/DS1-0@BNK1vgw05.example.com</C> for a T1 channel or <C>AALN/S0/SU0/0@HQ-VG310.example.com</C> for an analog port. The domain column shows the parent gateway FQDN.</p>
        </div>
      </div>
    ),
  },
  {
    id: "upgrade",
    title: "Upgrade Sequence",
    content: (
      <div className="space-y-3">
        <p>Calculates the optimal order to upgrade CUCM servers to minimize phone re-registrations and avoid outages.</p>
        <div className="space-y-2">
          <H4>Sequential vs Parallel</H4>
          <p>The sequential view shows one server at a time with per-step impact. The parallel view groups servers that can be upgraded simultaneously (servers in the same AG that don't share P1 duties).</p>
        </div>
        <div className="space-y-2">
          <H4>AG Context</H4>
          <p>Each step shows which AGs are impacted, along with affected CMGs and re-registration counts. This helps identify which parts of the phone population will be disrupted at each phase.</p>
        </div>
      </div>
    ),
  },
  {
    id: "architecture",
    title: "Architecture",
    content: (
      <div className="space-y-3">
        <div className="space-y-2">
          <H4>Data Flow</H4>
          <ol className="list-none space-y-1 ml-2">
            <li><C>AXL</C> — syncs servers, device pools, CMGs, phones, trunks, and MGCP endpoints from CUCM admin API</li>
            <li><C>RISPort</C> — polls real-time registration status for phones (DeviceClass Phone), SIP trunks (SIPTrunk), and MGCP endpoints (Gateway)</li>
            <li><C>Phone Scrape</C> — HTTP to phone web server for subnet mask discovery</li>
          </ol>
        </div>
        <div className="space-y-2">
          <H4>Polling</H4>
          <p>RISPort polls run on a configurable interval. Large clusters are batched (2000 phones per request) with rate limit awareness. Progress shows in the status bar and log panel.</p>
        </div>
        <div className="space-y-2">
          <H4>Real-time Updates</H4>
          <p>Socket.IO pushes registration updates, poller logs, and scrape progress to the browser in real-time. No manual refresh needed.</p>
        </div>
      </div>
    ),
  },
];

function H4({ children }: { children: React.ReactNode }) {
  return <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-noc-text-bright">{children}</div>;
}

function C({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-noc-cyan">{children}</span>;
}

function Badge({ children, color }: { children: React.ReactNode; color: "green" | "amber" | "red" | "cyan" }) {
  const colors = {
    green: "bg-noc-green/10 text-noc-green",
    amber: "bg-noc-amber/10 text-noc-amber",
    red: "bg-noc-red/10 text-noc-red",
    cyan: "bg-noc-cyan/10 text-noc-cyan",
  };
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest ${colors[color]}`}>
      {children}
    </span>
  );
}

export default function Help() {
  const [active, setActive] = useState("overview");

  return (
    <div className="animate-fade-in-up">
      <div className="mb-4">
        <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
          Help
        </h1>
        <p className="text-xs text-noc-text-dim mt-1 font-mono">
          CUCM Availability Dashboard — reference guide.
        </p>
      </div>

      <div className="flex gap-3">
        {/* Sidebar nav */}
        <nav className="shrink-0 w-48 border border-noc-border bg-noc-surface overflow-hidden self-start sticky top-10">
          <div className="tmux-title text-noc-amber">Topics</div>
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={`w-full text-left px-4 py-2 font-mono text-xs transition-colors cursor-pointer border-b border-noc-border/30 ${
                active === s.id
                  ? "bg-noc-amber/10 text-noc-amber font-semibold"
                  : "text-noc-text-dim hover:text-noc-text hover:bg-noc-panel/50"
              }`}
            >
              {s.title}
            </button>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-cyan">
            {sections.find((s) => s.id === active)?.title}
          </div>
          <div className="p-5 font-mono text-xs text-noc-text leading-relaxed">
            {sections.find((s) => s.id === active)?.content}
          </div>
        </div>
      </div>
    </div>
  );
}
