import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { UpgradeAnalysis, UpgradeStep, ParallelGroup } from "../api/client";
import { AgBadge, getAgColor } from "../components/AgBadge";
import { SgBadge } from "../components/SgBadge";

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60000);
}

function formatTime(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localISOString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function Upgrade() {
  const [analysis, setAnalysis] = useState<UpgradeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<string>(() => localISOString(new Date()));
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");
  const [maxPerGroup, setMaxPerGroup] = useState(0); // 0 = unlimited

  useEffect(() => {
    api
      .getUpgradeAnalysis()
      .then(setAnalysis)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-2 border-noc-amber border-t-transparent rounded-full animate-spin" />
          <p className="text-noc-text-dim text-xs font-mono mt-3 uppercase tracking-widest">
            Analyzing upgrade sequence...
          </p>
        </div>
      </div>
    );
  }

  if (!analysis || analysis.steps.length === 0) {
    return (
      <div className="text-center py-12 border border-dashed border-noc-border">
        <p className="font-mono text-sm text-noc-text-dim">
          No servers found to analyze
        </p>
      </div>
    );
  }

  const isParallel = mode === "parallel";

  // Re-chunk parallel groups when maxPerGroup is set
  const constrainedGroups = (() => {
    if (!isParallel || maxPerGroup === 0) return analysis.parallelGroups;
    const result: ParallelGroup[] = [];
    for (const group of analysis.parallelGroups) {
      if (group.steps.length <= maxPerGroup) {
        result.push({ ...group, groupNumber: result.length + 1 });
      } else {
        for (let i = 0; i < group.steps.length; i += maxPerGroup) {
          const chunk = group.steps.slice(i, i + maxPerGroup);
          const combinedReReg = chunk.reduce((s, st) => s + st.phonesReRegistering, 0);
          const combinedUnreg = chunk.reduce((s, st) => s + st.phonesUnregistered, 0);
          const estMin = Math.max(...chunk.map((s) => s.estimatedMinutes.min));
          const estMax = Math.max(...chunk.map((s) => s.estimatedMinutes.max));
          const notes = chunk.length > 1
            ? [`${chunk.length} servers upgrading in parallel`, `Servers: ${chunk.map((s) => s.serverName.split(".")[0]).join(", ")}`]
            : [];
          const chunkAgLabels = Array.from(new Set(chunk.flatMap((s) => s.agLabels))).sort();
          const chunkSgLabels = Array.from(new Set(chunk.flatMap((s) => s.sgLabels || []))).sort();
          result.push({
            groupNumber: result.length + 1,
            steps: chunk,
            combinedReRegistering: combinedReReg,
            combinedUnregistered: combinedUnreg,
            estimatedMinutes: { min: estMin, max: estMax },
            agLabels: chunkAgLabels,
            sgLabels: chunkSgLabels,
            notes,
          });
        }
      }
    }
    return result;
  })();

  const constrainedSummary = (() => {
    if (!isParallel || maxPerGroup === 0) return analysis.parallelSummary;
    const totalMin = constrainedGroups.reduce((s, g) => s + g.estimatedMinutes.min, 0);
    const totalMax = constrainedGroups.reduce((s, g) => s + g.estimatedMinutes.max, 0);
    return {
      totalGroups: constrainedGroups.length,
      maxConcurrentReRegistrations: constrainedGroups.length > 0
        ? Math.max(...constrainedGroups.map((g) => g.combinedReRegistering))
        : 0,
      estimatedTotalMinutes: { min: totalMin, max: totalMax },
    };
  })();

  const activeSummary = isParallel ? constrainedSummary : analysis.summary;
  const activeTotal = isParallel
    ? constrainedSummary.estimatedTotalMinutes
    : analysis.summary.estimatedTotalMinutes;
  const timeSavedMin = analysis.summary.estimatedTotalMinutes.min - constrainedSummary.estimatedTotalMinutes.min;
  const timeSavedMax = analysis.summary.estimatedTotalMinutes.max - constrainedSummary.estimatedTotalMinutes.max;

  // Max possible group size from the server data
  const maxGroupSize = Math.max(...analysis.parallelGroups.map((g) => g.steps.length), 1);

  return (
    <div className="space-y-3 animate-fade-in-up">
      <div className="mb-4">
        <h1 className="font-mono text-sm font-semibold text-noc-text-bright uppercase tracking-widest">
          Upgrade Sequence Analyzer
        </h1>
        <p className="text-xs text-noc-text-dim mt-1 font-mono">
          Recommended node upgrade order based on Cisco sequencing rules.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-3">
        <label className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim shrink-0">
          Mode
        </label>
        <button
          onClick={() => setMode(isParallel ? "sequential" : "parallel")}
          className="relative h-7 shrink-0 cursor-pointer bg-noc-bg border border-noc-border rounded"
          style={{ width: "11rem" }}
        >
          {/* Sliding highlight */}
          <div
            className={`absolute top-0.5 bottom-0.5 rounded-sm transition-all duration-200 ease-in-out ${
              isParallel ? "bg-noc-cyan" : "bg-noc-amber"
            }`}
            style={{
              left: isParallel ? "calc(50% + 1px)" : "2px",
              width: isParallel ? "calc(50% - 3px)" : "calc(50% - 3px)",
            }}
          />
          {/* Labels */}
          <div className="relative z-10 flex h-full">
            <div className={`w-1/2 flex items-center justify-center font-mono text-[9px] font-bold uppercase tracking-wider select-none transition-colors ${
              !isParallel ? "text-noc-bg" : "text-noc-text-dim"
            }`}>
              sequential
            </div>
            <div className={`w-1/2 flex items-center justify-center font-mono text-[9px] font-bold uppercase tracking-wider select-none transition-colors ${
              isParallel ? "text-noc-bg" : "text-noc-text-dim"
            }`}>
              parallel
            </div>
          </div>
        </button>
        {timeSavedMin > 0 && (
          <span className="font-mono text-[10px] text-noc-green uppercase tracking-widest">
            Parallel saves {formatDuration(timeSavedMin)}–{formatDuration(timeSavedMax)}
          </span>
        )}
      </div>

      {/* Max Concurrency Slider (parallel mode only) */}
      {isParallel && maxGroupSize > 1 && (
        <div className="border border-noc-border bg-noc-surface p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim shrink-0">
              Max Servers / Stage
            </label>
            <input
              type="range"
              min={1}
              max={maxGroupSize}
              value={maxPerGroup === 0 ? maxGroupSize : maxPerGroup}
              onChange={(e) => {
                const val = Number(e.target.value);
                setMaxPerGroup(val >= maxGroupSize ? 0 : val);
              }}
              className="flex-1 max-w-xs accent-noc-cyan h-1.5 cursor-pointer"
            />
            <span className="font-mono text-sm text-noc-cyan font-bold w-16 text-center">
              {maxPerGroup === 0 ? "Max" : maxPerGroup}
            </span>
            {maxPerGroup !== 0 && (
              <button
                onClick={() => setMaxPerGroup(0)}
                className="px-3 py-1.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
          {maxPerGroup !== 0 && (
            <p className="font-mono text-[10px] text-noc-text-dim mt-2">
              {constrainedGroups.length} stages — limit {maxPerGroup} server{maxPerGroup > 1 ? "s" : ""} per stage
            </p>
          )}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-noc-border">
        <StatBox
          label={isParallel ? "Groups" : "Steps"}
          value={isParallel ? constrainedSummary.totalGroups : analysis.totalSteps}
          color="cyan"
        />
        <StatBox label="Total Servers" value={analysis.totalServers} color="cyan" />
        <StatBox
          label={isParallel ? "Max Concurrent Re-Reg" : "Max Re-Reg"}
          value={activeSummary.maxConcurrentReRegistrations}
          color="amber"
        />
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-lg font-bold text-noc-blue">
            {formatDuration(activeTotal.min)} – {formatDuration(activeTotal.max)}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            Est. Total Duration
          </div>
        </div>
        <div className="bg-noc-surface p-4 text-center">
          <div className="font-mono text-3xl font-bold text-noc-green">
            {analysis.summary.totalPhones.toLocaleString()}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            Total Phones
          </div>
        </div>
      </div>

      {/* Comparison Banner (only in parallel mode) */}
      {isParallel && (
        <div className="border border-noc-cyan/20 bg-noc-cyan/5 p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1">Sequential Duration</div>
              <div className="font-mono text-sm text-noc-text line-through">
                {formatDuration(analysis.summary.estimatedTotalMinutes.min)} – {formatDuration(analysis.summary.estimatedTotalMinutes.max)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1">Parallel Duration</div>
              <div className="font-mono text-sm text-noc-cyan font-bold">
                {formatDuration(constrainedSummary.estimatedTotalMinutes.min)} – {formatDuration(constrainedSummary.estimatedTotalMinutes.max)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1">Max Concurrent Impact</div>
              <div className="font-mono text-sm flex items-center gap-1 flex-wrap">
                <span className="text-noc-text-dim">Sequential:</span>
                <span className="text-noc-amber">{analysis.summary.maxConcurrentReRegistrations.toLocaleString()}</span>
                <span className="text-noc-text-dim mx-1">vs</span>
                <span className="text-noc-text-dim">Parallel:</span>
                <span className="text-noc-amber">{constrainedSummary.maxConcurrentReRegistrations.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AG Overview */}
      {analysis.availabilityGroups.length > 0 && (
        <div className="border border-noc-border bg-noc-surface overflow-hidden">
          <div className="tmux-title text-noc-cyan">Availability Groups</div>
          <div className="p-4">
            <div className="flex flex-wrap gap-2">
              {analysis.availabilityGroups.map((ag) => {
                const c = getAgColor(ag.label);
                return (
                  <div key={ag.label} className={`border border-noc-border/50 ${c.bg} px-3 py-2`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`w-2 h-2 ${c.dot}`} />
                      <span className={`font-mono text-xs font-bold ${c.text}`}>{ag.label}</span>
                      <span className="font-mono text-[10px] text-noc-text-dim">
                        {ag.phoneCount.toLocaleString()} phones
                      </span>
                    </div>
                    <div className="font-mono text-[10px] text-noc-text-dim">
                      {ag.servers.join(", ")}
                    </div>
                    <div className="font-mono text-[10px] text-noc-text-dim mt-0.5">
                      {ag.cmgNames.length} CMG{ag.cmgNames.length !== 1 ? "s" : ""}: {ag.cmgNames.join(", ")}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Start Time Picker */}
      <div className="border border-noc-border bg-noc-surface p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim shrink-0">
            Maintenance Start
          </label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="max-w-xs px-3 py-2 border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
          />
          <button
            onClick={() => setStartTime(localISOString(new Date()))}
            className="px-3 py-1.5 border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
          >
            Now
          </button>
          {startTime && (
            <>
              <span className="font-mono text-xs text-noc-text-dim">→</span>
              <span className="font-mono text-xs text-noc-amber">
                Est. completion: {formatTime(addMinutes(new Date(startTime), activeTotal.min))}
                {" – "}
                {formatTime(addMinutes(new Date(startTime), activeTotal.max))}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Steps / Groups */}
      {isParallel ? (
        <ParallelView
          groups={constrainedGroups}
          totalPhones={analysis.summary.totalPhones}
          expandedGroup={expandedGroup}
          setExpandedGroup={setExpandedGroup}
          startTime={startTime}
        />
      ) : (
        <SequentialView
          steps={analysis.steps}
          totalPhones={analysis.summary.totalPhones}
          expandedStep={expandedStep}
          setExpandedStep={setExpandedStep}
          startTime={startTime}
        />
      )}

      {/* Scoring Formula — always visible at bottom */}
      <div className="border border-noc-border bg-noc-surface overflow-hidden">
        <div className="tmux-title text-noc-text-dim">
          Upgrade Order Formula
        </div>
        <div className="p-4 font-mono text-xs text-noc-text space-y-3">
          <div>
            <span className="text-noc-amber font-semibold">score = primaryPenalty + lastServicePenalty + phoneImpact</span>
            <span className="text-noc-text-dim ml-2">(lowest score upgrades first)</span>
          </div>
          <ol className="list-none space-y-2 ml-2">
            <li className="flex gap-2">
              <span className="text-noc-cyan shrink-0">1.</span>
              <div>
                <span className="text-noc-text-bright">Publisher first</span>
                <span className="text-noc-text-dim"> — Cisco requirement, always step 1</span>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-noc-cyan shrink-0">2.</span>
              <div>
                <span className="text-noc-text-bright">Backup CMG members before primary</span>
                <span className="text-noc-text-dim"> — P1 servers get +100K penalty, pushing them after P2/P3 members are already upgraded and back online</span>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-noc-cyan shrink-0">3.</span>
              <div>
                <span className="text-noc-text-bright">Avoid last-active service outage</span>
                <span className="text-noc-text-dim"> — if upgrading a server would cause any service (SG) to have 0 active instances, +50K penalty per service. Defers that server until others in the same SG are back online</span>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-noc-cyan shrink-0">4.</span>
              <div>
                <span className="text-noc-text-bright">Least phone re-registrations</span>
                <span className="text-noc-text-dim"> — tiebreaker: server affecting fewest phones goes first</span>
              </div>
            </li>
            <li className="flex gap-2">
              <span className="text-noc-cyan shrink-0">5.</span>
              <div>
                <span className="text-noc-text-bright">Non-CCM nodes last</span>
                <span className="text-noc-text-dim"> — TFTP, MOH, media servers have no call processing impact and can be upgraded in parallel if redundant</span>
              </div>
            </li>
          </ol>
          <div className="text-[10px] text-noc-text-dim border-t border-noc-border/50 pt-2 mt-2">
            The scoring formula is the same for sequential and parallel modes. Parallel mode uses the same ordered sequence but groups adjacent servers from independent AGs that can be upgraded simultaneously without overlapping phone or service impact.
          </div>
        </div>
      </div>
    </div>
  );
}

function SequentialView({
  steps,
  totalPhones,
  expandedStep,
  setExpandedStep,
  startTime,
}: {
  steps: UpgradeStep[];
  totalPhones: number;
  expandedStep: number | null;
  setExpandedStep: (s: number | null) => void;
  startTime: string;
}) {
  const cumulativeMin: number[] = [];
  let runMin = 0;
  for (const step of steps) {
    cumulativeMin.push(runMin);
    runMin += step.estimatedMinutes.min;
  }
  const startDate = startTime ? new Date(startTime) : null;

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden">
      <div className="tmux-title text-noc-amber">Sequential Upgrade Sequence</div>
      <div className="divide-y divide-noc-border/50">
        {steps.map((step, idx) => (
          <StepRow
            key={step.stepNumber}
            step={step}
            totalPhones={totalPhones}
            isExpanded={expandedStep === step.stepNumber}
            onToggle={() => setExpandedStep(expandedStep === step.stepNumber ? null : step.stepNumber)}
            startDate={startDate ? addMinutes(startDate, cumulativeMin[idx]) : null}
          />
        ))}
      </div>
    </div>
  );
}

function ParallelView({
  groups,
  totalPhones,
  expandedGroup,
  setExpandedGroup,
  startTime,
}: {
  groups: ParallelGroup[];
  totalPhones: number;
  expandedGroup: number | null;
  setExpandedGroup: (g: number | null) => void;
  startTime: string;
}) {
  const cumulativeMin: number[] = [];
  let runMin = 0;
  for (const group of groups) {
    cumulativeMin.push(runMin);
    runMin += group.estimatedMinutes.min;
  }
  const startDate = startTime ? new Date(startTime) : null;

  return (
    <div className="border border-noc-border bg-noc-surface overflow-hidden">
      <div className="tmux-title text-noc-cyan">Parallel Upgrade Sequence</div>
      <div className="divide-y divide-noc-border/50">
        {groups.map((group, idx) => {
          const isExpanded = expandedGroup === group.groupNumber;
          const isSingle = group.steps.length === 1;
          const hasImpact = group.combinedReRegistering > 0 || group.combinedUnregistered > 0;
          const groupStart = startDate ? addMinutes(startDate, cumulativeMin[idx]) : null;

          return (
            <div key={group.groupNumber}>
              <button
                onClick={() => setExpandedGroup(isExpanded ? null : group.groupNumber)}
                className="w-full flex items-center gap-4 px-4 py-3 hover:bg-noc-panel/50 transition-colors cursor-pointer"
              >
                {/* Group Number */}
                <div className={`flex items-center justify-center w-8 h-8 border shrink-0 ${
                  isSingle
                    ? "border-noc-border bg-noc-bg"
                    : "border-noc-cyan/30 bg-noc-cyan/5"
                }`}>
                  <span className={`font-mono text-sm font-bold ${
                    isSingle ? "text-noc-text-bright" : "text-noc-cyan"
                  }`}>
                    {group.groupNumber}
                  </span>
                </div>

                {/* Server Names + AG */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {group.steps.map((step, i) => (
                      <span key={step.serverId} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-noc-cyan font-mono text-xs">+</span>}
                        <span className="font-mono text-sm font-medium text-noc-text-bright">
                          {step.serverName.split(".")[0]}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                          {step.isPublisher ? "PUB" : "SUB"}
                        </span>
                      </span>
                    ))}
                    {group.agLabels.map((label) => (
                      <AgBadge key={label} label={label} />
                    ))}
                    {(group.sgLabels || []).map((label) => (
                      <SgBadge key={label} label={label} />
                    ))}
                  </div>
                  {!isSingle && (
                    <p className="font-mono text-[10px] text-noc-cyan mt-0.5">
                      {group.steps.length} servers in parallel
                    </p>
                  )}
                  {isSingle && group.steps[0].notes.length > 0 && (
                    <p className="font-mono text-[10px] text-noc-text-dim mt-0.5 truncate">
                      {group.steps[0].notes[0]}
                    </p>
                  )}
                </div>

                {/* Time Estimate */}
                <div className="text-right shrink-0">
                  <div className="font-mono text-xs text-noc-blue font-semibold">
                    {formatDuration(group.estimatedMinutes.min)}–{formatDuration(group.estimatedMinutes.max)}
                  </div>
                  {groupStart && (
                    <div className="font-mono text-[9px] text-noc-text-dim">
                      {groupStart.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    </div>
                  )}
                </div>

                {/* Impact Summary */}
                <div className="flex items-center gap-4 shrink-0">
                  {group.combinedReRegistering > 0 && (
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-noc-amber">
                        {group.combinedReRegistering.toLocaleString()}
                      </div>
                      <div className="font-mono text-[9px] text-noc-text-dim uppercase">re-reg</div>
                    </div>
                  )}
                  {group.combinedUnregistered > 0 && (
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-noc-red">
                        {group.combinedUnregistered.toLocaleString()}
                      </div>
                      <div className="font-mono text-[9px] text-noc-text-dim uppercase">down</div>
                    </div>
                  )}
                  {!hasImpact && (
                    <span className="font-mono text-xs text-noc-green font-semibold">NO IMPACT</span>
                  )}

                  <div className="w-24 h-2 bg-noc-bg overflow-hidden">
                    {totalPhones > 0 && (
                      <div
                        className={`h-full transition-all ${
                          group.combinedUnregistered > 0
                            ? "bg-noc-red"
                            : group.combinedReRegistering > 0
                              ? "bg-noc-amber"
                              : "bg-noc-green"
                        }`}
                        style={{
                          width: `${Math.max(
                            2,
                            ((group.combinedReRegistering + group.combinedUnregistered) / totalPhones) * 100
                          )}%`,
                        }}
                      />
                    )}
                  </div>

                  <svg
                    className={`w-4 h-4 text-noc-text-dim transition-transform ${isExpanded ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-4">
                  {group.notes.length > 0 && (
                    <div className="space-y-1">
                      {group.notes.map((note, i) => (
                        <div key={i} className="flex items-start gap-2 font-mono text-xs text-noc-cyan">
                          <span className="shrink-0 mt-0.5">→</span>
                          <span>{note}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {group.steps.map((step) => (
                    <div key={step.serverId} className="border border-noc-border/50 bg-noc-bg/50 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-noc-text-bright">
                          {step.serverName.split(".")[0]}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                          {step.isPublisher ? "PUB" : step.isCcmActive ? "CCM" : "NON-CCM"}
                        </span>
                        {step.agLabels.map((label) => (
                          <AgBadge key={label} label={label} />
                        ))}
                        {(step.sgLabels || []).map((label) => (
                          <SgBadge key={label} label={label} />
                        ))}
                        <span className="font-mono text-xs text-noc-blue">
                          {formatDuration(step.estimatedMinutes.min)}–{formatDuration(step.estimatedMinutes.max)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
                        <div className="px-3 py-2 bg-noc-bg">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">FQDN</div>
                          <div className="font-mono text-xs text-noc-text-bright truncate">{step.serverHostname}</div>
                        </div>
                        <div className="px-3 py-2 bg-noc-green/5">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">Unaffected</div>
                          <div className="font-mono text-sm text-noc-green font-bold">{step.phonesUnaffected.toLocaleString()}</div>
                        </div>
                        <div className="px-3 py-2 bg-noc-amber/5">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">Re-Registering</div>
                          <div className="font-mono text-sm text-noc-amber font-bold">{step.phonesReRegistering.toLocaleString()}</div>
                        </div>
                        <div className="px-3 py-2 bg-noc-red/5">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">Unregistered</div>
                          <div className="font-mono text-sm text-noc-red font-bold">{step.phonesUnregistered.toLocaleString()}</div>
                        </div>
                      </div>

                      {step.notes.length > 0 && (
                        <div className="space-y-0.5">
                          {step.notes.map((note, i) => (
                            <div key={i} className={`flex items-start gap-2 font-mono text-[11px] ${
                              note.startsWith("WARNING") ? "text-noc-red" : "text-noc-text-dim"
                            }`}>
                              <span className="shrink-0 mt-0.5">{note.startsWith("WARNING") ? "!" : "→"}</span>
                              <span>{note}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {step.affectedCmGroups.length > 0 && (
                        <div className="overflow-x-auto border border-noc-border/50">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-noc-border/50 text-noc-text-dim">
                                <th className="text-left px-3 py-2 font-mono font-medium">Affected CMG</th>
                                <th className="text-right px-3 py-2 font-mono font-medium">Re-Registering</th>
                                <th className="text-right px-3 py-2 font-mono font-medium">Unregistered</th>
                              </tr>
                            </thead>
                            <tbody>
                              {step.affectedCmGroups.map((cmg) => (
                                <tr key={cmg.cmGroupName} className="border-b border-noc-border/30">
                                  <td className="px-3 py-1.5 font-mono text-noc-text-bright">{cmg.cmGroupName}</td>
                                  <td className="px-3 py-1.5 text-right font-mono text-noc-amber font-semibold">
                                    {cmg.phonesReRegistering > 0 ? cmg.phonesReRegistering.toLocaleString() : "—"}
                                  </td>
                                  <td className="px-3 py-1.5 text-right font-mono text-noc-red font-semibold">
                                    {cmg.phonesUnregistered > 0 ? cmg.phonesUnregistered.toLocaleString() : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepRow({
  step,
  totalPhones,
  isExpanded,
  onToggle,
  startDate,
}: {
  step: UpgradeStep;
  totalPhones: number;
  isExpanded: boolean;
  onToggle: () => void;
  startDate: Date | null;
}) {
  const hasImpact = step.phonesReRegistering > 0 || step.phonesUnregistered > 0;

  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-4 px-4 py-3 hover:bg-noc-panel/50 transition-colors cursor-pointer"
      >
        {/* Step Number */}
        <div className="flex items-center justify-center w-8 h-8 border border-noc-border bg-noc-bg shrink-0">
          <span className="font-mono text-sm font-bold text-noc-text-bright">
            {step.stepNumber}
          </span>
        </div>

        {/* Server Info */}
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm font-medium text-noc-text-bright truncate">
              {step.serverName.split(".")[0]}
            </span>
            <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
              {step.isPublisher ? "PUB" : "SUB"}
            </span>
            {step.agLabels.map((label) => (
              <AgBadge key={label} label={label} />
            ))}
            {(step.sgLabels || []).map((label) => (
              <SgBadge key={label} label={label} />
            ))}
          </div>
          {step.notes.length > 0 && (
            <p className="font-mono text-[10px] text-noc-text-dim mt-0.5 truncate">
              {step.notes[0]}
            </p>
          )}
        </div>

        {/* Time Estimate */}
        <div className="text-right shrink-0">
          <div className="font-mono text-xs text-noc-blue font-semibold">
            {formatDuration(step.estimatedMinutes.min)}–{formatDuration(step.estimatedMinutes.max)}
          </div>
          {startDate && (
            <div className="font-mono text-[9px] text-noc-text-dim">
              {startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
            </div>
          )}
        </div>

        {/* Impact Summary */}
        <div className="flex items-center gap-4 shrink-0">
          {step.phonesReRegistering > 0 && (
            <div className="text-right">
              <div className="font-mono text-sm font-bold text-noc-amber">
                {step.phonesReRegistering.toLocaleString()}
              </div>
              <div className="font-mono text-[9px] text-noc-text-dim uppercase">re-reg</div>
            </div>
          )}
          {step.phonesUnregistered > 0 && (
            <div className="text-right">
              <div className="font-mono text-sm font-bold text-noc-red">
                {step.phonesUnregistered.toLocaleString()}
              </div>
              <div className="font-mono text-[9px] text-noc-text-dim uppercase">down</div>
            </div>
          )}
          {!hasImpact && (
            <span className="font-mono text-xs text-noc-green font-semibold">NO IMPACT</span>
          )}

          <div className="w-24 h-2 bg-noc-bg overflow-hidden">
            {totalPhones > 0 && (
              <div
                className={`h-full transition-all ${
                  step.phonesUnregistered > 0
                    ? "bg-noc-red"
                    : step.phonesReRegistering > 0
                      ? "bg-noc-amber"
                      : "bg-noc-green"
                }`}
                style={{
                  width: `${Math.max(
                    2,
                    ((step.phonesReRegistering + step.phonesUnregistered) / totalPhones) * 100
                  )}%`,
                }}
              />
            )}
          </div>

          <svg
            className={`w-4 h-4 text-noc-text-dim transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-noc-border">
            <div className="px-3 py-2 bg-noc-bg">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">FQDN</div>
              <div className="font-mono text-xs text-noc-text-bright truncate">{step.serverHostname}</div>
            </div>
            <div className="px-3 py-2 bg-noc-green/5">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">Unaffected</div>
              <div className="font-mono text-sm text-noc-green font-bold">{step.phonesUnaffected.toLocaleString()}</div>
            </div>
            <div className="px-3 py-2 bg-noc-amber/5">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">Re-Registering</div>
              <div className="font-mono text-sm text-noc-amber font-bold">{step.phonesReRegistering.toLocaleString()}</div>
            </div>
            <div className="px-3 py-2 bg-noc-red/5">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">Unregistered</div>
              <div className="font-mono text-sm text-noc-red font-bold">{step.phonesUnregistered.toLocaleString()}</div>
            </div>
          </div>

          {step.notes.length > 0 && (
            <div className="space-y-1">
              {step.notes.map((note, i) => (
                <div key={i} className={`flex items-start gap-2 font-mono text-xs ${
                  note.startsWith("WARNING") ? "text-noc-red" : "text-noc-text-dim"
                }`}>
                  <span className="shrink-0 mt-0.5">{note.startsWith("WARNING") ? "!" : "→"}</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {step.affectedCmGroups.length > 0 && (
            <div className="overflow-x-auto border border-noc-border/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-noc-border/50 text-noc-text-dim">
                    <th className="text-left px-3 py-2 font-mono font-medium">Affected CMG</th>
                    <th className="text-right px-3 py-2 font-mono font-medium">Re-Registering</th>
                    <th className="text-right px-3 py-2 font-mono font-medium">Unregistered</th>
                  </tr>
                </thead>
                <tbody>
                  {step.affectedCmGroups.map((cmg) => (
                    <tr key={cmg.cmGroupName} className="border-b border-noc-border/30 hover:bg-noc-panel/30">
                      <td className="px-3 py-1.5 font-mono text-noc-text-bright">{cmg.cmGroupName}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-noc-amber font-semibold">
                        {cmg.phonesReRegistering > 0 ? cmg.phonesReRegistering.toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-noc-red font-semibold">
                        {cmg.phonesUnregistered > 0 ? cmg.phonesUnregistered.toLocaleString() : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: "amber" | "blue" | "cyan" | "green";
}) {
  const colors = {
    amber: "text-noc-amber",
    blue: "text-noc-blue",
    cyan: "text-noc-cyan",
    green: "text-noc-green",
  };

  return (
    <div className="bg-noc-surface p-4 text-center">
      <div className={`font-mono text-3xl font-bold ${colors[color]}`}>{value.toLocaleString()}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">{label}</div>
    </div>
  );
}
