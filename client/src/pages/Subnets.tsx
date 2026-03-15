import { useState, useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { api } from "../api/client";
import type { Subnet, SubnetDistribution } from "../api/client";
import { useSort, ColHeader } from "../components/TableHeader";

const SOCKET_URL = import.meta.env.DEV ? "http://localhost:3000" : "";

export default function Subnets() {
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [distribution, setDistribution] = useState<SubnetDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [cidr, setCidr] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [discovered, setDiscovered] = useState<{ cidr: string; count: number; suggestedName: string }[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [adding, setAdding] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [parsing, setParsing] = useState(false);
  const [importMode, setImportMode] = useState<"scan" | "paste" | "scrape">("scan");
  const [scrapePreview, setScrapePreview] = useState<{ total: number; byModel: Record<string, number> } | null>(null);
  const [scraping, setScraping] = useState(false);
  const [rescrapeAll, setRescrapeAll] = useState(false);
  const [scrapeResult, setScrapeResult] = useState<{ phonesScraped: number; phonesWithMask: number; errors: number; updated?: { cidr: string; oldCidr: string; count: number }[] } | null>(null);

  const fetchData = async () => {
    try {
      const [s, d] = await Promise.all([
        api.getSubnets(),
        api.getSubnetDistribution(),
      ]);
      setSubnets(s);
      setDistribution(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    fetchData();

    const socket = io(SOCKET_URL);
    socketRef.current = socket;

    socket.on("scrape:complete", (result: {
      discovered: { cidr: string; count: number; suggestedName: string }[];
      updated: { cidr: string; oldCidr: string; count: number }[];
      phonesScraped: number;
      phonesWithMask: number;
      errors: number;
    }) => {
      setDiscovered(result.discovered);
      setScrapeResult({
        phonesScraped: result.phonesScraped,
        phonesWithMask: result.phonesWithMask,
        errors: result.errors,
        updated: result.updated,
      });
      setShowDiscover(true);
      setScraping(false);
      if (result.updated?.length > 0) {
        fetchData();
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      if (editId) {
        await api.updateSubnet(editId, cidr, name, description);
      } else {
        await api.createSubnet(cidr, name, description);
      }
      setCidr("");
      setName("");
      setDescription("");
      setEditId(null);
      await fetchData();
    } catch (err: any) {
      setError(err.message || "Failed to save subnet");
    }
  };

  const handleEdit = (s: Subnet) => {
    setEditId(s.id);
    setCidr(s.cidr);
    setName(s.name);
    setDescription(s.description);
  };

  const handleDelete = async (id: number) => {
    await api.deleteSubnet(id);
    await fetchData();
  };

  const handleCancel = () => {
    setEditId(null);
    setCidr("");
    setName("");
    setDescription("");
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await api.discoverSubnets();
      setDiscovered(result.discovered);
      setShowDiscover(true);
    } catch (e) {
      console.error(e);
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddAll = async () => {
    setAdding(true);
    try {
      await api.bulkCreateSubnets(
        discovered.map((d) => ({ cidr: d.cidr, name: d.suggestedName }))
      );
      setShowDiscover(false);
      setDiscovered([]);
      await fetchData();
    } catch (e) {
      console.error(e);
    } finally {
      setAdding(false);
    }
  };

  const handleParse = async () => {
    if (!pasteText.trim()) return;
    setParsing(true);
    try {
      const result = await api.parseSubnetMasks(pasteText);
      setDiscovered(result.discovered);
      setShowDiscover(true);
    } catch (e) {
      console.error(e);
    } finally {
      setParsing(false);
    }
  };

  const handleScrapePreview = async () => {
    try {
      const result = await api.scrapePreview(rescrapeAll);
      setScrapePreview(result);
    } catch (e) {
      console.error(e);
    }
  };

  const handleScrape = async () => {
    setScraping(true);
    setScrapeResult(null);
    try {
      await api.scrapePhones(rescrapeAll);
      // Results arrive via scrape:complete socket event
    } catch (e) {
      console.error(e);
      setScraping(false);
    }
  };

  const handleAddOne = async (d: { cidr: string; suggestedName: string }) => {
    try {
      await api.createSubnet(d.cidr, d.suggestedName, "Auto-discovered from phone IPs");
      setDiscovered((prev) => prev.filter((x) => x.cidr !== d.cidr));
      await fetchData();
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Loading subnets...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="mb-4">
        <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
          Subnet Mapping
        </h1>
        <p className="text-xs text-noc-text-dim mt-1 font-mono">
          Define subnets to map phone IP addresses to locations.
        </p>
      </div>

      {/* Add / Edit Form */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-amber">
          {editId ? "Edit Subnet" : "Add Subnet"}
        </div>
        <form onSubmit={handleSubmit} className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1.5">
                CIDR
              </label>
              <input
                type="text"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                placeholder="10.0.1.0/24"
                required
                className="w-full px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1.5">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Building A - Floor 2"
                required
                className="w-full px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1.5">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
              />
            </div>
          </div>
          {error && (
            <p className="text-noc-red text-xs font-mono mt-3">{error}</p>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="submit"
              className="px-4 py-1.5 border border-noc-amber/30 bg-noc-amber/10 text-xs font-mono uppercase tracking-widest text-noc-amber hover:bg-noc-amber/20 transition-all cursor-pointer"
            >
              {editId ? "Update" : "Add Subnet"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-4 py-1.5 border border-noc-border text-xs font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Auto-Discover / Import */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-cyan flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>Discover Subnets</span>
            <button
              onClick={() => { setImportMode("scan"); setShowDiscover(false); setDiscovered([]); }}
              className={`px-2 py-0.5 border text-[10px] font-mono uppercase tracking-widest transition-all cursor-pointer ${
                importMode === "scan"
                  ? "border-noc-cyan/50 text-noc-cyan bg-noc-cyan/10"
                  : "border-noc-border text-noc-text-dim"
              }`}
            >
              Scan RISPort
            </button>
            <button
              onClick={() => { setImportMode("paste"); setShowDiscover(false); setDiscovered([]); }}
              className={`px-2 py-0.5 border text-[10px] font-mono uppercase tracking-widest transition-all cursor-pointer ${
                importMode === "paste"
                  ? "border-noc-cyan/50 text-noc-cyan bg-noc-cyan/10"
                  : "border-noc-border text-noc-text-dim"
              }`}
            >
              Import IP+Mask
            </button>
            <button
              onClick={() => { setImportMode("scrape"); setShowDiscover(false); setDiscovered([]); setScrapePreview(null); setScrapeResult(null); handleScrapePreview(); }}
              className={`px-2 py-0.5 border text-[10px] font-mono uppercase tracking-widest transition-all cursor-pointer ${
                importMode === "scrape"
                  ? "border-noc-cyan/50 text-noc-cyan bg-noc-cyan/10"
                  : "border-noc-border text-noc-text-dim"
              }`}
            >
              Scrape Phones
            </button>
          </div>
        </div>
        <div className="p-4">
          {importMode === "scrape" ? (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 bg-noc-amber" />
                <span className="font-mono text-xs text-noc-amber font-semibold">
                  Warning: This scrapes each phone's web page individually and generates network traffic
                </span>
              </div>
              <p className="font-mono text-xs text-noc-text-dim mb-3">
                Connects to phones' built-in web server to read their actual subnet mask.
                Only scrapes registered phones with scrapeable models (hardware endpoints).
              </p>
              <label className="flex items-center gap-2 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rescrapeAll}
                  onChange={async (e) => {
                    const val = e.target.checked;
                    setRescrapeAll(val);
                    setScrapePreview(null);
                    try {
                      const result = await api.scrapePreview(val);
                      setScrapePreview(result);
                    } catch {}
                  }}
                  className="accent-noc-cyan"
                />
                <span className="font-mono text-xs text-noc-text">
                  Re-scrape all phones (update existing subnets if mask differs)
                </span>
              </label>
              {scrapePreview && (
                <div className="mb-3 p-3 border border-noc-border bg-noc-bg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-xs text-noc-text-bright font-semibold">
                      {scrapePreview.total} {rescrapeAll ? "scrapeable" : "unmapped"} phones to scrape
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-px">
                    {Object.entries(scrapePreview.byModel)
                      .sort(([, a], [, b]) => b - a)
                      .map(([model, count]) => (
                        <span
                          key={model}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-noc-surface border border-noc-border/50 font-mono text-[10px]"
                        >
                          <span className="text-noc-text-dim">{model}</span>
                          <span className="text-noc-amber font-semibold">{count}</span>
                        </span>
                      ))}
                  </div>
                </div>
              )}
              {scrapeResult && (
                <div className="mb-3 space-y-2">
                  <div className="grid grid-cols-3 gap-px bg-noc-border">
                    <div className="bg-noc-surface p-2 text-center">
                      <div className="font-mono text-lg font-bold text-noc-cyan">{scrapeResult.phonesScraped}</div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim">Scraped</div>
                    </div>
                    <div className="bg-noc-surface p-2 text-center">
                      <div className="font-mono text-lg font-bold text-noc-green">{scrapeResult.phonesWithMask}</div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim">Got Mask</div>
                    </div>
                    <div className="bg-noc-surface p-2 text-center">
                      <div className="font-mono text-lg font-bold text-noc-red">{scrapeResult.errors}</div>
                      <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim">Failed</div>
                    </div>
                  </div>
                  {scrapeResult.updated && scrapeResult.updated.length > 0 && (
                    <div className="p-3 border border-noc-green/30 bg-noc-green/5">
                      <div className="font-mono text-xs text-noc-green font-semibold mb-2">
                        {scrapeResult.updated.length} subnet{scrapeResult.updated.length !== 1 ? "s" : ""} corrected
                      </div>
                      {scrapeResult.updated.map((u) => (
                        <div key={u.cidr} className="font-mono text-[11px] text-noc-text py-0.5">
                          <span className="text-noc-text-dim">{u.oldCidr}</span>
                          <span className="text-noc-text-dim mx-1.5">&rarr;</span>
                          <span className="text-noc-green">{u.cidr}</span>
                          <span className="text-noc-text-dim ml-2">({u.count} phones)</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={handleScrape}
                disabled={scraping || (!scrapePreview || scrapePreview.total === 0)}
                className="px-4 py-1.5 border border-noc-amber/30 bg-noc-amber/10 text-[10px] font-mono uppercase tracking-widest text-noc-amber hover:bg-noc-amber/20 transition-all cursor-pointer disabled:opacity-50"
              >
                {scraping ? "Scraping..." : "Start Scrape"}
              </button>
            </div>
          ) : importMode === "scan" ? (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="font-mono text-xs text-noc-text-dim">
                  Scans phone IPs from RISPort data, assumes /24 for missing subnets
                </span>
                <button
                  onClick={handleDiscover}
                  disabled={discovering}
                  className="px-3 py-1 border border-noc-cyan/30 bg-noc-cyan/10 text-[10px] font-mono uppercase tracking-widest text-noc-cyan hover:bg-noc-cyan/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {discovering ? "Scanning..." : "Scan"}
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-mono text-xs text-noc-text-dim mb-2">
                Paste IP + subnet mask pairs (one per line, e.g. "10.128.45.12  255.255.255.0")
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={"10.128.45.12  255.255.255.0\n10.130.10.5   255.255.255.128\n10.77.0.50    255.255.224.0"}
                className="w-full px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-xs focus:outline-none focus:border-noc-amber/50 resize-y"
              />
              <div className="flex items-center justify-between mt-2">
                <span className="font-mono text-[10px] text-noc-text-dim">
                  {pasteText.trim() ? `${pasteText.trim().split("\n").length} lines` : "No data"}
                </span>
                <button
                  onClick={handleParse}
                  disabled={parsing || !pasteText.trim()}
                  className="px-3 py-1 border border-noc-cyan/30 bg-noc-cyan/10 text-[10px] font-mono uppercase tracking-widest text-noc-cyan hover:bg-noc-cyan/20 transition-all cursor-pointer disabled:opacity-50"
                >
                  {parsing ? "Parsing..." : "Parse & Discover"}
                </button>
              </div>
            </div>
          )}

          {/* Results table (shared by both modes) */}
          {showDiscover && (
            <div className="mt-4 border-t border-noc-border pt-4">
              {discovered.length === 0 ? (
                <div className="text-center py-4">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 bg-noc-green" />
                    <span className="font-mono text-sm text-noc-green font-semibold">
                      {importMode === "scan"
                        ? "All phone IPs are covered by existing subnets"
                        : "All parsed subnets already exist"}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs text-noc-text-dim">
                      Found {discovered.length} new subnets ({discovered.reduce((s, d) => s + d.count, 0)} phones)
                    </span>
                    <button
                      onClick={handleAddAll}
                      disabled={adding}
                      className="px-3 py-1 border border-noc-amber/30 bg-noc-amber/10 text-[10px] font-mono uppercase tracking-widest text-noc-amber hover:bg-noc-amber/20 transition-all cursor-pointer disabled:opacity-50"
                    >
                      {adding ? "Adding..." : "Add All"}
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
                      <thead>
                        <tr className="border-b border-noc-border text-noc-text-dim">
                          <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-widest font-normal">CIDR</th>
                          <th className="px-4 py-2 text-left font-mono text-[10px] uppercase tracking-widest font-normal">Name</th>
                          <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-widest font-normal">Phones</th>
                          <th className="px-4 py-2 text-right font-mono text-[10px] uppercase tracking-widest font-normal" style={{ width: 80 }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {discovered.map((d, i) => (
                          <tr
                            key={d.cidr}
                            className={`border-b border-noc-border/50 ${
                              i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                            }`}
                          >
                            <td className="px-4 py-2 font-mono text-noc-cyan truncate">{d.cidr}</td>
                            <td className="px-4 py-2 font-mono text-noc-text-bright truncate">{d.suggestedName}</td>
                            <td className="px-4 py-2 text-right font-mono text-noc-amber font-semibold">{d.count}</td>
                            <td className="px-4 py-2 text-right">
                              <button
                                onClick={() => handleAddOne(d)}
                                className="px-2 py-0.5 border border-noc-green/30 text-[10px] font-mono uppercase tracking-widest text-noc-green/70 hover:text-noc-green hover:border-noc-green/50 transition-all cursor-pointer"
                              >
                                Add
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Subnet List */}
      {subnets.length > 0 && (
        <SubnetTable
          subnets={subnets}
          distribution={distribution}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
      )}

      {/* Distribution Summary */}
      {distribution && distribution.subnets.length > 0 && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
          <div className="tmux-title text-noc-green flex items-center justify-between">
            <span>Phone Distribution by Subnet</span>
            <span className="font-mono text-[10px] text-noc-text-dim normal-case tracking-normal">
              {distribution.unmapped} phones unmapped
            </span>
          </div>
          <div className="divide-y divide-noc-border/50">
            {distribution.subnets.map((s) => (
              <div key={s.cidr} className="px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-medium text-noc-text-bright">
                      {s.subnetName}
                    </span>
                    <span className="font-mono text-xs text-noc-text-dim">
                      {s.cidr}
                    </span>
                  </div>
                  <span className="font-mono text-sm text-noc-amber font-semibold">
                    {s.count} phones
                  </span>
                </div>
                <div className="flex flex-wrap gap-px">
                  {Object.entries(s.cmGroups)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cmg, count]) => (
                      <span
                        key={cmg}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-noc-bg border border-noc-border/50 font-mono text-[10px]"
                      >
                        <span className="text-noc-text-dim">{cmg}</span>
                        <span className="text-noc-cyan font-semibold">{count}</span>
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

type SubnetSortKey = "cidr" | "name" | "description" | "phones";

function SubnetTable({
  subnets,
  distribution,
  onEdit,
  onDelete,
}: {
  subnets: Subnet[];
  distribution: SubnetDistribution | null;
  onEdit: (s: Subnet) => void;
  onDelete: (id: number) => void;
}) {
  const { sort, toggle, sorted } = useSort<SubnetSortKey>();

  const accessor = (s: Subnet, key: SubnetSortKey): string | number => {
    switch (key) {
      case "cidr": return s.cidr;
      case "name": return s.name;
      case "description": return s.description || "";
      case "phones": return distribution?.subnets.find((d) => d.subnetId === s.id)?.count || 0;
    }
  };

  const rows = sorted(subnets, accessor);

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden pane-resize">
      <div className="tmux-title text-noc-cyan">
        Defined Subnets ({subnets.length})
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr className="border-b border-noc-border text-noc-text-dim">
              <ColHeader label="CIDR" sortKey="cidr" sort={sort} onSort={toggle} />
              <ColHeader label="Name" sortKey="name" sort={sort} onSort={toggle} />
              <ColHeader label="Description" sortKey="description" sort={sort} onSort={toggle} />
              <ColHeader label="Phones" sortKey="phones" sort={sort} onSort={toggle} align="right" />
              <ColHeader label="Actions" sort={null} align="right" resizable={false} />
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => {
              const dist = distribution?.subnets.find((d) => d.subnetId === s.id);
              return (
                <tr
                  key={s.id}
                  className={`border-b border-noc-border/50 hover:bg-noc-panel/50 transition-colors ${
                    i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                  }`}
                >
                  <td className="px-4 py-2.5 font-mono text-noc-cyan truncate">{s.cidr}</td>
                  <td className="px-4 py-2.5 font-mono font-medium text-noc-text-bright truncate">{s.name}</td>
                  <td className="px-4 py-2.5 font-mono text-noc-text-dim truncate">{s.description || "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-noc-amber font-semibold">{dist?.count || 0}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEdit(s)}
                        className="px-2 py-0.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onDelete(s.id)}
                        className="px-2 py-0.5 border border-noc-red/20 text-[10px] font-mono uppercase tracking-widest text-noc-red/60 hover:text-noc-red hover:border-noc-red/40 transition-all cursor-pointer"
                      >
                        Del
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
