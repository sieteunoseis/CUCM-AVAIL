import { useState, useEffect } from "react";
import { api } from "../api/client";
import type { UpgradeAnalysis, UpgradeStep, ParallelGroup } from "../api/client";

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

export default function Upgrade() {
  const [analysis, setAnalysis] = useState<UpgradeAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<string>("");
  const [mode, setMode] = useState<"sequential" | "parallel">("sequential");

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
      <div className="text-center py-12 border border-dashed border-noc-border rounded-lg">
        <p className="font-mono text-sm text-noc-text-dim">
          No servers found to analyze
        </p>
      </div>
    );
  }

  const isParallel = mode === "parallel";
  const activeSummary = isParallel ? analysis.parallelSummary : analysis.summary;
  const activeTotal = isParallel
    ? analysis.parallelSummary.estimatedTotalMinutes
    : analysis.summary.estimatedTotalMinutes;
  const timeSavedMin = analysis.summary.estimatedTotalMinutes.min - analysis.parallelSummary.estimatedTotalMinutes.min;
  const timeSavedMax = analysis.summary.estimatedTotalMinutes.max - analysis.parallelSummary.estimatedTotalMinutes.max;

  return (
    <div className="space-y-10 animate-fade-in-up">
      <div className="mb-8">
        <h1 className="font-mono text-xl font-semibold text-noc-text-bright">
          Upgrade Sequence Analyzer
        </h1>
        <p className="text-sm text-noc-text-dim mt-1">
          Recommended node upgrade order based on Cisco sequencing rules and minimum phone impact.
        </p>
      </div>

      {/* Mode Toggle */}
      <div className="flex items-center gap-3">
        <div className="inline-flex rounded-lg border border-noc-border overflow-hidden">
          <button
            onClick={() => setMode("sequential")}
            className={`px-5 py-2.5 font-mono text-xs uppercase tracking-widest transition-all cursor-pointer ${
              mode === "sequential"
                ? "bg-noc-amber/10 text-noc-amber border-r border-noc-border"
                : "bg-noc-surface text-noc-text-dim hover:text-noc-text border-r border-noc-border"
            }`}
          >
            Sequential
          </button>
          <button
            onClick={() => setMode("parallel")}
            className={`px-5 py-2.5 font-mono text-xs uppercase tracking-widest transition-all cursor-pointer ${
              mode === "parallel"
                ? "bg-noc-cyan/10 text-noc-cyan"
                : "bg-noc-surface text-noc-text-dim hover:text-noc-text"
            }`}
          >
            Parallel
          </button>
        </div>
        {timeSavedMin > 0 && (
          <span className="font-mono text-xs text-noc-green">
            Parallel saves {formatDuration(timeSavedMin)}–{formatDuration(timeSavedMax)}
          </span>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-5">
        <StatBox
          label={isParallel ? "Groups" : "Steps"}
          value={isParallel ? analysis.parallelSummary.totalGroups : analysis.totalSteps}
          color="cyan"
        />
        <StatBox
          label="Total Servers"
          value={analysis.totalServers}
          color="cyan"
        />
        <StatBox
          label={isParallel ? "Max Concurrent Re-Reg" : "Max Re-Reg"}
          value={activeSummary.maxConcurrentReRegistrations}
          color="amber"
        />
        <div className="rounded-lg border bg-noc-surface p-5 text-center border-noc-blue/15">
          <div className="font-mono text-lg font-bold text-noc-blue">
            {formatDuration(activeTotal.min)} – {formatDuration(activeTotal.max)}
          </div>
          <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
            Est. Total Duration
          </div>
        </div>
        <div className="rounded-lg border bg-noc-surface p-5 text-center border-noc-green/15">
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
        <div className="rounded-lg border border-noc-cyan/20 bg-noc-cyan/5 p-5">
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
                {formatDuration(analysis.parallelSummary.estimatedTotalMinutes.min)} – {formatDuration(analysis.parallelSummary.estimatedTotalMinutes.max)}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim mb-1">Max Concurrent Impact</div>
              <div className="font-mono text-sm">
                <span className="text-noc-text-dim">Sequential: </span>
                <span className="text-noc-amber">{analysis.summary.maxConcurrentReRegistrations.toLocaleString()}</span>
                <span className="text-noc-text-dim mx-2">vs</span>
                <span className="text-noc-text-dim">Parallel: </span>
                <span className="text-noc-amber">{analysis.parallelSummary.maxConcurrentReRegistrations.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Start Time Picker */}
      <div className="rounded-lg border border-noc-border bg-noc-surface p-5">
        <div className="flex items-center gap-4 flex-wrap">
          <label className="font-mono text-[10px] uppercase tracking-widest text-noc-text-dim shrink-0">
            Maintenance Start
          </label>
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="max-w-xs px-4 py-2.5 rounded-lg border border-noc-border bg-noc-bg text-noc-text-bright font-mono text-sm focus:outline-none focus:border-noc-amber/50"
          />
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
          {startTime && (
            <button
              onClick={() => setStartTime("")}
              className="px-3 py-1.5 rounded border border-noc-border text-[10px] font-mono uppercase tracking-widest text-noc-text-dim hover:text-noc-text transition-all cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Steps / Groups */}
      {isParallel ? (
        <ParallelView
          groups={analysis.parallelGroups}
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
    <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-amber">
          Sequential Upgrade Sequence
        </h2>
        <p className="text-[10px] font-mono text-noc-text-dim mt-1">
          Each step assumes the previous server has completed its upgrade and is back online
        </p>
      </div>

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
    <div className="rounded-lg border border-noc-border bg-noc-surface overflow-hidden">
      <div className="px-6 py-4 border-b border-noc-border bg-noc-panel">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-noc-cyan">
          Parallel Upgrade Sequence
        </h2>
        <p className="text-[10px] font-mono text-noc-text-dim mt-1">
          Servers within a group upgrade simultaneously — groups execute sequentially
        </p>
      </div>

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
                className="w-full flex items-center gap-4 px-6 py-5 hover:bg-noc-panel/50 transition-colors cursor-pointer"
              >
                {/* Group Number */}
                <div className={`flex items-center justify-center w-10 h-10 rounded-full border shrink-0 ${
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

                {/* Server Names */}
                <div className="flex-1 text-left min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {group.steps.map((step, i) => (
                      <span key={step.serverId} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-noc-cyan font-mono text-xs">+</span>}
                        <span className="font-mono text-sm font-medium text-noc-text-bright">
                          {step.serverName.split(".")[0]}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                          {step.isPublisher ? "PUB" : "SUB"}
                        </span>
                      </span>
                    ))}
                  </div>
                  {!isSingle && (
                    <p className="font-mono text-[10px] text-noc-cyan mt-0.5">
                      {group.steps.length} servers in parallel — no shared CMGs
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
                      <div className="font-mono text-[9px] text-noc-text-dim uppercase">
                        re-reg
                      </div>
                    </div>
                  )}
                  {group.combinedUnregistered > 0 && (
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-noc-red">
                        {group.combinedUnregistered.toLocaleString()}
                      </div>
                      <div className="font-mono text-[9px] text-noc-text-dim uppercase">
                        down
                      </div>
                    </div>
                  )}
                  {!hasImpact && (
                    <span className="font-mono text-xs text-noc-green font-semibold">
                      NO IMPACT
                    </span>
                  )}

                  {/* Impact bar */}
                  <div className="w-24 h-2 rounded-full bg-noc-bg overflow-hidden">
                    {totalPhones > 0 && (
                      <div
                        className={`h-full rounded-full transition-all ${
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
                    className={`w-4 h-4 text-noc-text-dim transition-transform ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {/* Expanded: show individual steps */}
              {isExpanded && (
                <div className="px-6 pb-5 space-y-4">
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
                    <div key={step.serverId} className="rounded-lg border border-noc-border/50 bg-noc-bg/50 p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-semibold text-noc-text-bright">
                          {step.serverName.split(".")[0]}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
                          {step.isPublisher ? "PUB" : step.isCcmActive ? "CCM" : "NON-CCM"}
                        </span>
                        <span className="font-mono text-xs text-noc-blue">
                          {formatDuration(step.estimatedMinutes.min)}–{formatDuration(step.estimatedMinutes.max)}
                        </span>
                      </div>

                      {/* Stats row */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="px-3 py-2 rounded border border-noc-border bg-noc-bg">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">FQDN</div>
                          <div className="font-mono text-xs text-noc-text-bright truncate">{step.serverHostname}</div>
                        </div>
                        <div className="px-3 py-2 rounded border border-noc-green/20 bg-noc-green/5">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">Unaffected</div>
                          <div className="font-mono text-sm text-noc-green font-bold">{step.phonesUnaffected.toLocaleString()}</div>
                        </div>
                        <div className="px-3 py-2 rounded border border-noc-amber/20 bg-noc-amber/5">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">Re-Registering</div>
                          <div className="font-mono text-sm text-noc-amber font-bold">{step.phonesReRegistering.toLocaleString()}</div>
                        </div>
                        <div className="px-3 py-2 rounded border border-noc-red/20 bg-noc-red/5">
                          <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-0.5">Unregistered</div>
                          <div className="font-mono text-sm text-noc-red font-bold">{step.phonesUnregistered.toLocaleString()}</div>
                        </div>
                      </div>

                      {/* Notes */}
                      {step.notes.length > 0 && (
                        <div className="space-y-0.5">
                          {step.notes.map((note, i) => (
                            <div key={i} className={`flex items-start gap-2 font-mono text-[11px] ${
                              note.startsWith("WARNING") ? "text-noc-red" : "text-noc-text-dim"
                            }`}>
                              <span className="shrink-0 mt-0.5">{note.startsWith("WARNING") ? "⚠" : "→"}</span>
                              <span>{note}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Affected CMGs */}
                      {step.affectedCmGroups.length > 0 && (
                        <div className="overflow-x-auto rounded border border-noc-border/50">
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
        className="w-full flex items-center gap-4 px-6 py-5 hover:bg-noc-panel/50 transition-colors cursor-pointer"
      >
        {/* Step Number */}
        <div className="flex items-center justify-center w-10 h-10 rounded-full border border-noc-border bg-noc-bg shrink-0">
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
            <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold uppercase tracking-widest bg-noc-border text-noc-text-dim">
              {step.isPublisher ? "PUB" : "SUB"}
            </span>
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

          <div className="w-24 h-2 rounded-full bg-noc-bg overflow-hidden">
            {totalPhones > 0 && (
              <div
                className={`h-full rounded-full transition-all ${
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

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-6 pb-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="px-4 py-3 rounded-lg border border-noc-border bg-noc-bg">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">FQDN</div>
              <div className="font-mono text-xs text-noc-text-bright truncate">{step.serverHostname}</div>
            </div>
            <div className="px-4 py-3 rounded-lg border border-noc-green/20 bg-noc-green/5">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">Unaffected</div>
              <div className="font-mono text-sm text-noc-green font-bold">{step.phonesUnaffected.toLocaleString()}</div>
            </div>
            <div className="px-4 py-3 rounded-lg border border-noc-amber/20 bg-noc-amber/5">
              <div className="font-mono text-[10px] text-noc-text-dim uppercase tracking-widest mb-1">Re-Registering</div>
              <div className="font-mono text-sm text-noc-amber font-bold">{step.phonesReRegistering.toLocaleString()}</div>
            </div>
            <div className="px-4 py-3 rounded-lg border border-noc-red/20 bg-noc-red/5">
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
                  <span className="shrink-0 mt-0.5">{note.startsWith("WARNING") ? "⚠" : "→"}</span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          )}

          {step.affectedCmGroups.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-noc-border/50">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-noc-border/50 text-noc-text-dim">
                    <th className="text-left px-4 py-2.5 font-mono font-medium">Affected CMG</th>
                    <th className="text-right px-4 py-2.5 font-mono font-medium">Re-Registering</th>
                    <th className="text-right px-4 py-2.5 font-mono font-medium">Unregistered</th>
                  </tr>
                </thead>
                <tbody>
                  {step.affectedCmGroups.map((cmg) => (
                    <tr key={cmg.cmGroupName} className="border-b border-noc-border/30 hover:bg-noc-panel/30">
                      <td className="px-4 py-2 font-mono text-noc-text-bright">{cmg.cmGroupName}</td>
                      <td className="px-4 py-2 text-right font-mono text-noc-amber font-semibold">
                        {cmg.phonesReRegistering > 0 ? cmg.phonesReRegistering.toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-noc-red font-semibold">
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
    amber: "text-noc-amber border-noc-amber/15",
    blue: "text-noc-blue border-noc-blue/15",
    cyan: "text-noc-cyan border-noc-cyan/15",
    green: "text-noc-green border-noc-green/15",
  };

  return (
    <div className={`rounded-lg border bg-noc-surface p-5 text-center ${colors[color]}`}>
      <div className="font-mono text-3xl font-bold">{value.toLocaleString()}</div>
      <div className="font-mono text-[10px] uppercase tracking-widest mt-2 text-noc-text-dim">
        {label}
      </div>
    </div>
  );
}
