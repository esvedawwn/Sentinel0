import { useState } from "react";
import {
  useListFiles,
  useListCategories,
  useUpdateFile,
  getListFilesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, formatTimestamp, statusColor, statusLabel } from "@/lib/utils";
import { motion } from "framer-motion";

type FileStatus = "ready" | "review" | "action_required" | "corrupted";

const STATUS_FILTERS: { value: FileStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "ready", label: "Ready" },
  { value: "review", label: "Review" },
  { value: "action_required", label: "Action Required" },
  { value: "corrupted", label: "Corrupted" },
];

export default function Analyse() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<FileStatus | "">("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: categories } = useListCategories();
  const { data: fileData, isLoading } = useListFiles(
    { search: search || undefined, category: category || undefined, status: status || undefined, limit: 100 },
    { query: { queryKey: getListFilesQueryKey({ search: search || undefined, category: category || undefined, status: status || undefined, limit: 100 }), placeholderData: (prev: import("@workspace/api-client-react").FileListResponse | undefined) => prev } }
  );
  const updateFile = useUpdateFile({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListFilesQueryKey() });
      },
    },
  });

  const files = fileData?.files ?? [];
  const selected = files.find((f) => f.id === selectedId);

  return (
    <div className="flex h-full">
      {/* File list panel */}
      <div className="flex-1 p-8 overflow-y-auto" style={{ maxWidth: selected ? "60%" : "100%" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-white">Analyse</h1>
          <span
            className="text-xs font-mono"
            style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
          >
            {fileData?.total ?? 0} FILES
          </span>
        </div>

        {/* Search + filters */}
        <div className="flex flex-col gap-3 mb-6">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files... (⌘⇧F)"
            className="w-full px-4 py-2.5 text-sm rounded outline-none text-white"
            style={{
              background: "#1A1A1A",
              border: "1px solid rgba(255,255,255,0.1)",
              fontFamily: "var(--app-font-mono)",
              fontSize: "0.8rem",
            }}
          />

          <div className="flex gap-2 flex-wrap">
            {/* Category filters */}
            <button
              onClick={() => setCategory("")}
              className="px-3 py-1.5 text-xs rounded transition-colors duration-150"
              style={{
                background: !category ? "rgba(52, 211, 153, 0.15)" : "rgba(255,255,255,0.06)",
                color: !category ? "#34D399" : "rgba(255,255,255,0.6)",
                border: !category ? "1px solid rgba(52,211,153,0.3)" : "1px solid transparent",
              }}
            >
              All Categories
            </button>
            {(categories ?? []).map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategory(cat.id === category ? "" : cat.id)}
                className="px-3 py-1.5 text-xs rounded transition-colors duration-150"
                style={{
                  background: cat.id === category ? "rgba(52, 211, 153, 0.15)" : "rgba(255,255,255,0.06)",
                  color: cat.id === category ? "#34D399" : "rgba(255,255,255,0.6)",
                  border: cat.id === category ? "1px solid rgba(52,211,153,0.3)" : "1px solid transparent",
                }}
              >
                {cat.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                onClick={() => setStatus(s.value as FileStatus | "")}
                className="px-3 py-1 text-xs rounded transition-colors duration-150"
                style={{
                  background: status === s.value ? "rgba(255,255,255,0.1)" : "transparent",
                  color: status === s.value ? "#ffffff" : "rgba(255,255,255,0.4)",
                  border: status === s.value ? "1px solid rgba(255,255,255,0.2)" : "1px solid transparent",
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* File list */}
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-12 rounded animate-pulse" style={{ background: "#222222" }} />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
              No files found. Start a scan from the Dashboard.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {files.map((file, i) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: i * 0.01, duration: 0.15 }}
                onClick={() => setSelectedId(selectedId === file.id ? null : file.id)}
                className="flex items-center gap-4 px-4 py-3 rounded cursor-pointer transition-colors duration-100"
                style={{
                  background: selectedId === file.id ? "#222222" : "transparent",
                  border: selectedId === file.id ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                }}
                onMouseEnter={(e) => {
                  if (selectedId !== file.id)
                    (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)";
                }}
                onMouseLeave={(e) => {
                  if (selectedId !== file.id)
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                }}
              >
                {/* Extension badge */}
                <span
                  className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    color: "rgba(255,255,255,0.5)",
                    fontFamily: "var(--app-font-mono)",
                    minWidth: "40px",
                    textAlign: "center",
                  }}
                >
                  {file.extension || "—"}
                </span>

                {/* Name + path */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{file.name}</div>
                  <div
                    className="text-xs font-mono truncate"
                    style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                  >
                    {file.path}
                  </div>
                </div>

                {/* Category */}
                <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {file.category}
                </span>

                {/* Size */}
                <span
                  className="text-xs font-mono shrink-0 w-20 text-right"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                >
                  {formatBytes(file.sizeBytes)}
                </span>

                {/* Status */}
                <span
                  className="text-xs font-mono shrink-0 px-2 py-0.5 rounded"
                  style={{
                    fontFamily: "var(--app-font-mono)",
                    color: statusColor(file.status),
                    background: `${statusColor(file.status)}18`,
                  }}
                >
                  {statusLabel(file.status)}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
          className="w-80 shrink-0 p-6 overflow-y-auto"
          style={{
            background: "#1A1A1A",
            borderLeft: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="flex items-start justify-between mb-6">
            <div>
              <h2 className="text-sm font-semibold text-white break-all">{selected.name}</h2>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="text-lg leading-none"
              style={{ color: "rgba(255,255,255,0.3)" }}
            >
              ×
            </button>
          </div>

          <div className="space-y-4">
            <Field label="Path">
              <span
                className="text-xs font-mono break-all"
                style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--app-font-mono)" }}
              >
                {selected.path}
              </span>
            </Field>
            <Field label="Extension">
              <span className="text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
                {selected.extension || "none"}
              </span>
            </Field>
            <Field label="Size">
              <span
                className="text-sm font-mono"
                style={{ color: "rgba(255,255,255,0.7)", fontFamily: "var(--app-font-mono)" }}
              >
                {formatBytes(selected.sizeBytes)}
              </span>
            </Field>
            <Field label="Status">
              <span
                className="text-xs font-mono px-2 py-0.5 rounded"
                style={{
                  color: statusColor(selected.status),
                  background: `${statusColor(selected.status)}18`,
                  fontFamily: "var(--app-font-mono)",
                }}
              >
                {statusLabel(selected.status)}
              </span>
            </Field>
            <Field label="Indexed">
              <span
                className="text-xs font-mono"
                style={{ color: "rgba(255,255,255,0.5)", fontFamily: "var(--app-font-mono)" }}
              >
                {formatTimestamp(selected.indexedAt)}
              </span>
            </Field>
            <Field label="Tags">
              <div className="flex flex-wrap gap-1">
                {selected.tags.length > 0 ? (
                  selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded"
                      style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
                    >
                      {tag}
                    </span>
                  ))
                ) : (
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    No tags
                  </span>
                )}
              </div>
            </Field>
            <Field label="Category">
              <select
                value={selected.category}
                onChange={(e) =>
                  updateFile.mutate({ id: selected.id, data: { category: e.target.value } })
                }
                className="text-xs rounded px-2 py-1.5 outline-none w-full"
                style={{
                  background: "#222222",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#ffffff",
                }}
              >
                {(categories ?? []).map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </motion.div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        className="text-xs tracking-widest uppercase mb-1"
        style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}
