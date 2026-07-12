import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProjects,
  useListProjectCandidates,
  useGenerateProjectCandidates,
  useApproveProjectCandidate,
  useRejectProjectCandidate,
  useMergeProjectCandidates,
  useGetProject,
  useSearchProjects,
  getListProjectsQueryKey,
  getListProjectCandidatesQueryKey,
  getSearchProjectsQueryKey,
} from "@workspace/api-client-react";
import type {
  ProjectSummary,
  ProjectFileSummary,
  ProjectTimelineEntry,
  ProjectCandidate,
  ProjectSearchResult,
  ListProjects200,
  ListProjectCandidates200,
} from "@workspace/api-client-react";
import { formatBytes } from "@/lib/utils";

type PanelView = "candidates" | "projects" | "search";

const SIGNAL_LABELS: Record<string, string> = {
  folderProximity: "Folder",
  sharedTags: "Tags",
  sharedEntities: "Entities",
  filenameSimilarity: "Filename",
  sharedAiCategory: "Category",
  dateProximity: "Date",
  semanticSimilarity: "Semantic",
};

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "#34D399" : pct >= 40 ? "#FBBF24" : "rgba(255,255,255,0.4)";
  return (
    <span
      className="text-xs font-mono px-1.5 py-0.5 rounded"
      style={{ color, background: `${color}18`, border: `1px solid ${color}40`, fontFamily: "var(--app-font-mono)" }}
    >
      {pct}%
    </span>
  );
}

function SignalBar({ signals }: { signals: Record<string, number> }) {
  return (
    <div className="flex gap-1.5 flex-wrap mt-1">
      {Object.entries(signals)
        .filter(([, v]) => v > 0)
        .sort(([, a], [, b]) => b - a)
        .map(([k, v]) => (
          <span
            key={k}
            className="text-xs px-1.5 py-0.5 rounded"
            style={{
              color: "rgba(255,255,255,0.5)",
              background: `rgba(52,211,153,${v * 0.18})`,
              border: "1px solid rgba(52,211,153,0.15)",
              fontFamily: "var(--app-font-mono)",
              fontSize: "0.65rem",
            }}
          >
            {SIGNAL_LABELS[k] ?? k} {Math.round(v * 100)}%
          </span>
        ))}
    </div>
  );
}

function CategoryBreakdown({ files, categories }: { files: ProjectFileSummary[]; categories: string[] }) {
  if (categories.length === 0) return null;
  const breakdown = categories.map((cat) => {
    const catFiles = files.filter((f) => f.aiCategory === cat);
    return { cat, count: catFiles.length, bytes: catFiles.reduce((s, f) => s + f.sizeBytes, 0) };
  }).sort((a, b) => b.bytes - a.bytes);
  const maxBytes = Math.max(...breakdown.map((b) => b.bytes), 1);

  return (
    <div className="sentinel-card p-4 mb-4">
      <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
        Category Breakdown
      </div>
      <div className="space-y-2.5">
        {breakdown.map(({ cat, count, bytes }) => (
          <div key={cat}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "rgba(255,255,255,0.7)" }}>{cat}</span>
              <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
                {count} file{count !== 1 ? "s" : ""} · {formatBytes(bytes)}
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(bytes / maxBytes) * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: "linear-gradient(90deg, #34D399, rgba(52,211,153,0.5))" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AutoSummary({
  project,
  categories,
  people,
  orgs,
  fileCount,
  storageTotalBytes,
}: {
  project: ProjectSummary;
  categories: string[];
  people: string[];
  orgs: string[];
  fileCount: number;
  storageTotalBytes: number;
}) {
  const summary = project.summary ?? (() => {
    const parts: string[] = [];
    parts.push(`${fileCount} file${fileCount !== 1 ? "s" : ""}`);
    if (categories.length > 0) {
      parts.push(
        `${categories.length} categor${categories.length !== 1 ? "ies" : "y"}: ${categories.slice(0, 2).join(", ")}${categories.length > 2 ? "…" : ""}`
      );
    }
    const entities = [...people.slice(0, 2), ...orgs.slice(0, 2)];
    if (entities.length > 0) parts.push(`related to ${entities.join(", ")}`);
    parts.push(formatBytes(storageTotalBytes));
    return parts.join(" · ");
  })();

  return (
    <div
      className="text-xs px-3 py-2.5 rounded mb-4"
      style={{ background: "rgba(52,211,153,0.05)", color: "#34D399", border: "1px solid rgba(52,211,153,0.15)", lineHeight: 1.6 }}
    >
      <span className="opacity-50 mr-2" style={{ fontFamily: "var(--app-font-mono)" }}>AI SUMMARY</span>
      {summary}
    </div>
  );
}

function ProjectDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, isLoading } = useGetProject(id);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.3)" }}>
        Loading…
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex-1 flex items-center justify-center" style={{ color: "rgba(255,255,255,0.3)" }}>
        Project not found.
      </div>
    );
  }

  const project: ProjectSummary = data.project;
  const files: ProjectFileSummary[] = data.files ?? [];
  const people: string[] = data.people ?? [];
  const orgs: string[] = data.orgs ?? [];
  const categories: string[] = data.categories ?? [];
  const timeline: ProjectTimelineEntry[] = data.timeline ?? [];
  const storageTotalBytes: number = data.storageTotalBytes ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex-1 min-w-0"
    >
      <button
        onClick={onBack}
        className="text-xs mb-4 flex items-center gap-1"
        style={{ color: "rgba(255,255,255,0.4)" }}
      >
        ← Back to projects
      </button>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white">{project.name}</h2>
        {project.description && (
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>{project.description}</p>
        )}
        <div className="flex items-center gap-3 mt-2">
          <ScoreBadge score={project.confidence} />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
            {files.length} files · {formatBytes(storageTotalBytes)}
          </span>
        </div>
      </div>

      {/* AI Summary */}
      <AutoSummary
        project={project}
        categories={categories}
        people={people}
        orgs={orgs}
        fileCount={files.length}
        storageTotalBytes={storageTotalBytes}
      />

      {/* Explanation */}
      {project.explanation && (
        <div
          className="text-xs px-3 py-2 rounded mb-4"
          style={{ background: "rgba(96,165,250,0.06)", color: "#60A5FA", border: "1px solid rgba(96,165,250,0.15)" }}
        >
          {project.explanation}
        </div>
      )}

      {/* Category Breakdown */}
      <CategoryBreakdown files={files} categories={categories} />

      {/* People & Orgs */}
      {(people.length > 0 || orgs.length > 0) && (
        <div className="sentinel-card p-4 mb-4">
          <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
            Entities
          </div>
          {people.length > 0 && (
            <div className="mb-2">
              <span className="text-xs mr-2" style={{ color: "rgba(255,255,255,0.3)" }}>People</span>
              {people.map((p) => (
                <span key={p} className="text-xs mr-2 px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>{p}</span>
              ))}
            </div>
          )}
          {orgs.length > 0 && (
            <div>
              <span className="text-xs mr-2" style={{ color: "rgba(255,255,255,0.3)" }}>Organisations</span>
              {orgs.map((o) => (
                <span key={o} className="text-xs mr-2 px-1.5 py-0.5 rounded" style={{ color: "rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>{o}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="sentinel-card p-4 mb-4">
          <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
            Timeline
          </div>
          <div className="space-y-1.5">
            {timeline.slice(0, 10).map((t) => (
              <div key={t.findingId} className="flex items-center justify-between text-xs">
                <span className="truncate" style={{ color: "rgba(255,255,255,0.7)" }}>{t.name}</span>
                <span style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
                  {t.date ? new Date(t.date).toLocaleDateString() : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Files */}
      <div className="sentinel-card overflow-hidden">
        <div className="px-4 pt-4 pb-3">
          <div className="text-xs tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}>
            Files ({files.length})
          </div>
        </div>
        {files.map((f, idx) => (
          <div
            key={f.id}
            className="flex items-center justify-between px-4 py-2.5"
            style={{
              borderTop: "1px solid rgba(255,255,255,0.05)",
              background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
            }}
          >
            <div className="min-w-0 pr-4">
              <div className="text-sm text-white truncate">{f.name}</div>
              <div className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}>
                {f.path}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {f.aiCategory && (
                <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "#60A5FA", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)" }}>
                  {f.aiCategory}
                </span>
              )}
              <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
                {formatBytes(f.sizeBytes)}
              </span>
            </div>
          </div>
        ))}
        {files.length === 0 && (
          <div className="px-4 py-8 text-center text-sm" style={{ color: "rgba(255,255,255,0.25)" }}>
            No files linked to this project.
          </div>
        )}
      </div>
    </motion.div>
  );
}

function SearchView({ onSelectProject }: { onSelectProject: (id: number) => void }) {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");

  const { data, isFetching } = useSearchProjects(
    { q: query },
    { query: { queryKey: getSearchProjectsQueryKey({ q: query }), enabled: query.length > 0 } }
  );

  const results: ProjectSearchResult[] = (data as { results?: ProjectSearchResult[] } | undefined)?.results ?? [];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed) setQuery(trimmed);
  }

  return (
    <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <form onSubmit={handleSubmit} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search projects by name, description, or linked file…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            className="flex-1 text-sm px-3 py-2 rounded outline-none"
            style={{
              background: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "white",
            }}
            autoFocus
          />
          <button
            type="submit"
            className="text-xs px-4 py-2 rounded font-medium"
            style={{ background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)" }}
          >
            Search
          </button>
        </div>
      </form>

      {isFetching && (
        <div className="text-center py-8 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Searching…</div>
      )}

      {!isFetching && query && results.length === 0 && (
        <div className="text-center py-16">
          <div className="text-sm mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>No projects matched "{query}"</div>
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            Try searching by project name, file name, or category.
          </div>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs mb-3" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
            {results.length} result{results.length !== 1 ? "s" : ""} for "{query}"
          </div>
          {results.map((r) => (
            <motion.div
              key={r.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="sentinel-card p-4 cursor-pointer group"
              style={{ border: "1px solid rgba(255,255,255,0.07)" }}
              onClick={() => onSelectProject(r.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white group-hover:text-[#34D399] transition-colors">{r.name}</span>
                    <ScoreBadge score={r.confidence} />
                    <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                      {r.fileCount} file{r.fileCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  {r.explanation && (
                    <p className="text-xs mt-1 truncate" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {r.explanation}
                    </p>
                  )}
                  {r.matchContext && (
                    <span
                      className="text-xs mt-1 inline-block px-1.5 py-0.5 rounded"
                      style={{ color: "#FBBF24", background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}
                    >
                      {r.matchContext}
                    </span>
                  )}
                </div>
                <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--app-font-mono)" }}>
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {!query && (
        <div className="text-center py-16">
          <div className="text-sm mb-2" style={{ color: "rgba(255,255,255,0.4)" }}>Search across your projects</div>
          <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
            Searches project names, descriptions, explanations, and linked file names.
          </div>
        </div>
      )}
    </motion.div>
  );
}

export default function Projects() {
  const [view, setView] = useState<PanelView>("candidates");
  const [selectedProject, setSelectedProject] = useState<number | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: candidatesData, isFetching: candidatesLoading } = useListProjectCandidates(
    { status: "pending" },
    { query: { queryKey: getListProjectCandidatesQueryKey({ status: "pending" }), refetchInterval: 10_000 } }
  );

  const { data: projectsData, isFetching: projectsLoading } = useListProjects(
    { status: "active" },
    { query: { queryKey: getListProjectsQueryKey({ status: "active" }), refetchInterval: 10_000 } }
  );

  const generateCandidates = useGenerateProjectCandidates({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectCandidatesQueryKey() });
        setView("candidates");
      },
    },
  });

  const approve = useApproveProjectCandidate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProjectCandidatesQueryKey() });
      },
    },
  });

  const reject = useRejectProjectCandidate({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListProjectCandidatesQueryKey() }),
    },
  });

  const merge = useMergeProjectCandidates({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListProjectCandidatesQueryKey() });
        setSelectedCandidates(new Set());
        setView("projects");
      },
    },
  });

  const candidates: ProjectCandidate[] = (candidatesData as ListProjectCandidates200 | undefined)?.candidates ?? [];
  const projects: ProjectSummary[] = (projectsData as ListProjects200 | undefined)?.projects ?? [];

  function toggleCandidate(id: number) {
    setSelectedCandidates((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (selectedProject !== null) {
    return (
      <div className="p-8 max-w-4xl flex gap-6">
        <ProjectDetail id={selectedProject} onBack={() => setSelectedProject(null)} />
      </div>
    );
  }

  const TABS: Array<{ key: PanelView; label: (counts: { candidates: number; projects: number }) => string }> = [
    { key: "candidates", label: ({ candidates: c }) => `Candidates (${c})` },
    { key: "projects",   label: ({ projects: p }) => `Projects (${p})` },
    { key: "search",     label: () => "Search" },
  ];

  return (
    <div className="p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Projects</h1>
        <p className="text-xs font-mono mt-1" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
          AI-PROPOSED GROUPINGS · APPROVE TO CONFIRM · NO FILES ARE MOVED
        </p>
      </div>

      {/* Tab bar + generate button */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-1" style={{ background: "#1A1A1A", borderRadius: 8, padding: 3, border: "1px solid rgba(255,255,255,0.08)" }}>
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className="px-4 py-1.5 text-xs font-medium rounded-md transition-colors"
              style={{
                background: view === key ? "#222222" : "transparent",
                color: view === key ? "white" : "rgba(255,255,255,0.45)",
                border: view === key ? "1px solid rgba(255,255,255,0.12)" : "1px solid transparent",
              }}
            >
              {label({ candidates: candidates.length, projects: projects.length })}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          {view === "candidates" && selectedCandidates.size >= 2 && (
            <button
              disabled={merge.isPending}
              onClick={() => merge.mutate({ data: { candidateIds: [...selectedCandidates] } })}
              className="text-xs px-3 py-1.5 rounded"
              style={{ background: "rgba(251,191,36,0.1)", color: "#FBBF24", border: "1px solid rgba(251,191,36,0.3)" }}
            >
              Merge {selectedCandidates.size} selected
            </button>
          )}
          {view !== "search" && (
            <button
              disabled={generateCandidates.isPending}
              onClick={() => generateCandidates.mutate({ data: {} })}
              className="text-xs px-3 py-1.5 rounded font-medium"
              style={{ background: "rgba(52,211,153,0.12)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)" }}
            >
              {generateCandidates.isPending ? "Analysing…" : "Analyse"}
            </button>
          )}
        </div>
      </div>

      {/* Views */}
      <AnimatePresence mode="wait">
        {view === "candidates" && (
          <motion.div key="candidates" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {candidatesLoading && candidates.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</div>
            ) : candidates.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>No pending candidates.</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Click <strong>Analyse</strong> to let Sentinel group your files into project candidates.
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {candidates.map((c) => {
                  const isSelected = selectedCandidates.has(c.id);
                  return (
                    <motion.div
                      key={c.id}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="sentinel-card p-4"
                      style={{
                        border: isSelected
                          ? "1px solid rgba(251,191,36,0.35)"
                          : "1px solid rgba(255,255,255,0.07)",
                        background: isSelected ? "rgba(251,191,36,0.04)" : "#222222",
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCandidate(c.id)}
                            className="mt-0.5 shrink-0"
                            style={{ accentColor: "#FBBF24" }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-white">{c.name}</span>
                              <ScoreBadge score={c.score} />
                              <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                                {c.findingCount} file{c.findingCount !== 1 ? "s" : ""}
                              </span>
                            </div>
                            {c.explanation && (
                              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>
                                {c.explanation}
                              </p>
                            )}
                            <SignalBar signals={c.signals} />
                          </div>
                        </div>

                        <div className="flex gap-2 shrink-0">
                          <button
                            disabled={approve.isPending}
                            onClick={() => approve.mutate({ id: c.id })}
                            className="text-xs px-3 py-1.5 rounded"
                            style={{ background: "rgba(52,211,153,0.1)", color: "#34D399", border: "1px solid rgba(52,211,153,0.3)" }}
                          >
                            Approve
                          </button>
                          <button
                            disabled={reject.isPending}
                            onClick={() => reject.mutate({ id: c.id })}
                            className="text-xs px-3 py-1.5 rounded"
                            style={{ background: "rgba(255,255,255,0.04)", color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.1)" }}
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {view === "projects" && (
          <motion.div key="projects" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {projectsLoading && projects.length === 0 ? (
              <div className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>Loading…</div>
            ) : projects.length === 0 ? (
              <div className="text-center py-16">
                <div className="text-sm mb-3" style={{ color: "rgba(255,255,255,0.4)" }}>No projects yet.</div>
                <div className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                  Approve candidates to create your first project.
                </div>
              </div>
            ) : (
              <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                {projects.map((p, idx) => (
                  <motion.div
                    key={p.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex items-center justify-between px-4 py-3 cursor-pointer group"
                    style={{
                      background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                    onClick={() => setSelectedProject(p.id)}
                  >
                    <div className="min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white group-hover:text-[#34D399] transition-colors">
                          {p.name}
                        </span>
                        <ScoreBadge score={p.confidence} />
                      </div>
                      {p.explanation && (
                        <div className="text-xs mt-0.5 truncate" style={{ color: "rgba(255,255,255,0.35)" }}>
                          {p.explanation}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 text-xs font-mono" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
                      {p.fileCount} file{p.fileCount !== 1 ? "s" : ""}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {view === "search" && (
          <SearchView onSelectProject={(id) => setSelectedProject(id)} />
        )}
      </AnimatePresence>

      {/* How it works */}
      {view !== "search" && (
        <div
          className="mt-8 p-4 rounded"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--app-font-mono)" }}>
            How it works
          </div>
          <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
            Sentinel groups findings by shared folder paths, filenames, AI categories, semantic tags, extracted
            entities, and modification timestamps. Candidates are proposals — no files are moved or renamed until
            you explicitly act on them in Action Queue.
          </p>
        </div>
      )}
    </div>
  );
}
