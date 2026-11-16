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
          <p>CMGs that use the <em>exact same set of servers</em> (regardless of priority order) share an AG number. AGs are numbered by phone count (AG-1 has the most phones), the same numbering used on the Dashboard and Simulation pages.</p>
        </div>

        <div className="space-y-2">
          <H4>Comparing CM Groups</H4>
          <p>Click a CMG row to select it. Every other row is marked <span className="text-noc-green">✓ safe</span> (shares no servers) or <span className="text-noc-red">✗ shares …</span> (lists the shared servers, which are also outlined in the grid). Click a second row to get a one-line verdict for that pair. Click the selected row again, or Clear, to reset.</p>
          <p>With a selection, <strong>Device Pools in Blast Radius</strong> below the matrix lists the pools on the selected CMG(s) and the pools on other CMGs that share any of their servers (with the shared servers), plus totals for pools and phones not impacted. Pools with no phones are dimmed — trunks or gateways may still use them.</p>
          <div className="border border-noc-red/20 bg-noc-red/5 p-3 mt-2">
            <div className="font-mono text-[10px] text-noc-red uppercase tracking-widest mb-2">Why this matters</div>
            <p className="text-xs">A safe pair can be upgraded or lose every server on one side while the other keeps running. For split-room redundancy (e.g. call center side A/B), phones on each side must be in CMGs that are a safe pair.</p>
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
            <li><Badge color="cyan">ALREADY FAILED OVER</Badge> — the phone's CMG primary is one of the selected servers and the phone is already registered to a backup (an outage in progress)</li>
            <li><Badge color="red">UNREGISTERED</Badge> — all servers in the phone's CMG are disabled</li>
          </ul>
          <p>Already-unregistered phones are excluded — the simulation shows <em>additional</em> impact only.</p>
          <p>Servers stay in the list while they are down (marked <strong>down now</strong>), so during a planned outage you can select the nodes that are offline and still see which phones they affect.</p>
        </div>
        <div className="space-y-2">
          <H4>Per-CMG Breakdown</H4>
          <p>Each CMG row shows its AG badge, phone count, and impact. Expanding a row shows affected subnets with stacked bar charts and per-phone movement details.</p>
        </div>
        <div className="space-y-2">
          <H4>Trunk Impact</H4>
          <p>SIP trunks follow the same CMG failover logic. Trunks that lose all servers show as "NO SERVICE".</p>
        </div>
        <div className="space-y-2">
          <H4>Gateway Impact</H4>
          <p>MGCP gateways register to multiple servers. The impact shows how many endpoint registrations survive (e.g., 3/3 → 1/3 = DEGRADED, 3/3 → 0/3 = NO SERVICE). Requires <C>ENABLE_GATEWAYS=true</C>.</p>
        </div>
        <div className="space-y-2">
          <H4>Service Impact</H4>
          <p>Shows which CUCM services would experience an outage if all active instances of that service are on disabled servers. Each service card shows its SG badge and active instance count transition. Only flags OUTAGE (0 instances remaining) — partial loss is expected when services are intentionally isolated to specific servers.</p>
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
        <div className="space-y-2">
          <H4>Subnet Table</H4>
          <p>One row per defined subnet with its phone count. Click a row to expand its CM group breakdown (and its CER subnet, when CER is enabled). The header counts phones mapped to a subnet, phones with an IP outside every subnet, phones with no IP (not registered and no last-known IP), and phones sharing an IP with others (e.g. Expressway/MRA) that no defined subnet covers. Shared-IP phones do count under a subnet you defined for them (such as an Expressway <C>/32</C>), but are never used for CER import or replace suggestions.</p>
        </div>
        <div className="space-y-2">
          <H4>CER Cross-Reference (optional)</H4>
          <p>Set <C>CER_PUB</C>, <C>CER_USERNAME</C> and <C>CER_PASSWORD</C> to enable it; the account needs the CER API role. Use <C>Sync CER</C> on the Dashboard to pull CER's IPv4 subnets (non-trackable ones are ignored). Each subnet then shows:</p>
          <ul className="list-none space-y-1 ml-2">
            <li><span className="text-noc-green">✓</span> — CER has the exact same subnet (shows its ERL)</li>
            <li><span className="text-noc-green">✓ inside CER …</span> — ours sits inside a wider CER subnet (e.g. an Expressway <C>/32</C> inside CER's <C>/24</C>); fine as is</li>
            <li><span className="text-noc-amber">⚠</span> — CER splits it into narrower subnets (or mixes wider and narrower)</li>
            <li><C>Use CER</C> (⚠ and inside rows) on a ⚠ row replaces ours with the overlapping CER subnets that contain phones or that you already have defined. On an inside row it only works when you already have the wider CER subnet defined: ours is removed and its phones roll up into it. A confirmation lists every change first. <C>Replace all mismatches</C> only touches ⚠ rows</li>
            <li><span className="text-noc-red">✗ missing</span> — no CER subnet overlaps it</li>
          </ul>
          <p>Unmapped phones are grouped by the CER subnet that contains them, ready to <C>Import</C> (name = ERL, description = CER location). Phones no CER subnet covers are listed as 911 gaps. CER subnets wider than /22 are marked broad and skipped by the bulk actions. Sync CER never changes your subnets on its own.</p>
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
    id: "services",
    title: "Services",
    content: (
      <div className="space-y-3">
        <p>Monitors all customer-facing CUCM services across every subscriber. The Serviceability API is queried during each AXL sync to discover which services are running on which servers.</p>
        <div className="space-y-2">
          <H4>Service Status Matrix</H4>
          <p>A grid of services (rows) × servers (columns). Green squares indicate the service is Started, gray means Stopped or Not Activated, red means Error. Each row shows an active count (e.g., 8/13).</p>
        </div>
        <div className="space-y-2">
          <H4>Service Groups (SG)</H4>
          <p>Like Availability Groups (AG) for call processing, Service Groups identify which services share the same server set. Services running on the exact same set of servers belong to the same SG. SG badges appear next to service names and on the Upgrade Sequence and Simulation pages.</p>
          <p>For example, if Extension Mobility and CTI Manager both run on the same 8 servers, they share an SG. If TFTP only runs on 2 dedicated servers, it gets its own SG. This helps identify single points of failure — if an SG has only 1 server, losing that server means a full service outage.</p>
        </div>
      </div>
    ),
  },
  {
    id: "upgrade",
    title: "Upgrade Sequence",
    content: (
      <div className="space-y-3">
        <p>Calculates the optimal order to upgrade CUCM servers to minimize phone re-registrations and avoid service outages.</p>
        <div className="space-y-2">
          <H4>Scoring Formula</H4>
          <p>Each server gets a score — lowest score upgrades first:</p>
          <ul className="list-none space-y-1 ml-2">
            <li><C>+100K</C> — primary CMG member (P1 servers upgrade after their backups)</li>
            <li><C>+50K</C> — per service that would go to 0 active instances (avoids service outage)</li>
            <li><C>+N</C> — number of phones that will re-register (tiebreaker)</li>
          </ul>
          <p>Publisher always goes first per Cisco requirements. Non-CCM nodes (TFTP, MOH) go last.</p>
        </div>
        <div className="space-y-2">
          <H4>Sequential vs Parallel</H4>
          <p>Both modes use the same scoring formula. Sequential upgrades one server at a time. Parallel groups servers from independent AGs that can be upgraded simultaneously without overlapping phone or service impact.</p>
        </div>
        <div className="space-y-2">
          <H4>AG + SG Context</H4>
          <p>Each step shows AG badges (which phone groups are affected) and SG badges (which service groups are affected). Steps that would cause a service outage include a warning note.</p>
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
