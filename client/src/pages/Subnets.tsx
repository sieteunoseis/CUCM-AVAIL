import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { Subnet, SubnetDistribution } from "../api/client";

export default function Subnets() {
  const [subnets, setSubnets] = useState<Subnet[]>([]);
  const [distribution, setDistribution] = useState<SubnetDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [cidr, setCidr] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState("");

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

  useEffect(() => {
    fetchData();
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
    <div className="space-y-10 animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold text-noc-text-bright">
          Subnet Mapping
        </h1>
        <p className="text-sm text-noc-text-dim mt-1">
          Define subnets to map phone IP addresses to locations. Used in CMG groups and failover simulation.
        </p>
      </div>

      {/* Add / Edit Form */}
      <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
        <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-amber">
            {editId ? "Edit Subnet" : "Add Subnet"}
          </h2>
        </div>
        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
                CIDR
              </label>
              <input
                type="text"
                value={cidr}
                onChange={(e) => setCidr(e.target.value)}
                placeholder="10.0.1.0/24"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Building A - Floor 2"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
              />
            </div>
            <div>
              <label className="block font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-2">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-4 py-2.5 rounded-lg border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
              />
            </div>
          </div>
          {error && (
            <p className="text-noc-red text-xs font-mono mt-3">{error}</p>
          )}
          <div className="flex gap-3 mt-4">
            <button
              type="submit"
              className="px-5 py-2.5 rounded-lg border border-noc-amber/30 bg-noc-amber/10 text-xs font-mono uppercase tracking-widest text-noc-amber hover:bg-noc-amber/20 transition-all cursor-pointer"
            >
              {editId ? "Update" : "Add Subnet"}
            </button>
            {editId && (
              <button
                type="button"
                onClick={handleCancel}
                className="px-5 py-2.5 rounded-lg border border-noc-border text-xs font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Subnet List */}
      {subnets.length > 0 && (
        <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-cyan">
              Defined Subnets ({subnets.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-noc-border text-noc-text-dim">
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">CIDR</th>
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">Name</th>
                  <th className="text-left px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">Description</th>
                  <th className="text-right px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">Phones</th>
                  <th className="text-right px-6 py-3.5 font-mono text-xs font-medium uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {subnets.map((s, i) => {
                  const dist = distribution?.subnets.find((d) => d.subnetId === s.id);
                  return (
                    <tr
                      key={s.id}
                      className={`border-b border-noc-border/50 hover:bg-noc-panel/50 transition-colors ${
                        i % 2 === 0 ? "bg-noc-surface" : "bg-noc-bg/30"
                      }`}
                    >
                      <td className="px-6 py-3.5 font-mono text-noc-cyan">{s.cidr}</td>
                      <td className="px-6 py-3.5 font-mono font-medium text-noc-text-bright">{s.name}</td>
                      <td className="px-6 py-3.5 font-mono text-noc-text-dim">{s.description || "—"}</td>
                      <td className="px-6 py-3.5 text-right font-mono text-noc-amber font-semibold">
                        {dist?.count || 0}
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(s)}
                            className="px-2.5 py-1 rounded border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text hover:border-noc-border-bright transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(s.id)}
                            className="px-2.5 py-1 rounded border border-noc-red/20 text-[10px] font-mono uppercase tracking-widest text-noc-red/60 hover:text-noc-red hover:border-noc-red/40 transition-all cursor-pointer"
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
      )}

      {/* Distribution Summary */}
      {distribution && distribution.subnets.length > 0 && (
        <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-noc-border bg-noc-panel flex items-center justify-between">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-green">
              Phone Distribution by Subnet
            </h2>
            <span className="font-mono text-[10px] text-noc-text-dim">
              {distribution.unmapped} phones unmapped
            </span>
          </div>
          <div className="divide-y divide-noc-border/50">
            {distribution.subnets.map((s) => (
              <div key={s.cidr} className="px-6 py-4">
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
                <div className="flex flex-wrap gap-2">
                  {Object.entries(s.cmGroups)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cmg, count]) => (
                      <span
                        key={cmg}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-noc-bg border border-noc-border/50 font-mono text-[10px]"
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
