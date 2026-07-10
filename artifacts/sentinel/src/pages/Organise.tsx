import { useState } from "react";
import {
  useListDuplicates,
  useListFiles,
  useResolveDuplicate,
  getListDuplicatesQueryKey,
  getGetDashboardNeedsAttentionQueryKey,
} from "@workspace/api-client-react";
import type { DuplicateGroup } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatBytes, statusLabel } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

function DuplicateGroupCard({
  group,
  index,
  onResolve,
  isPending,
}: {
  group: DuplicateGroup;
  index: number;
  onResolve: (id: number, data: { action: "keep_one" | "ignore" | "false_positive"; keepFindingId?: number | null }) => void;
  isPending: boolean;
}) {
  const [preferredId, setPreferredId] = useState<number | null>(group.canonicalFindingId ?? null);
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      className="sentinel-card p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <span
          className="text-xs font-mono"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
        >
          GROUP #{group.id} · {group.members.length} FILES · {formatBytes(group.wastedBytes)} WASTED
        </span>
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgba(251, 191, 36, 0.12)",
            color: "#FBBF24",
            fontFamily: "var(--app-font-mono)",
          }}
        >
          REVIEW
        </span>
      </div>

      <p
        className="text-xs mb-4"
        style={{ color: "rgba(255,255,255,0.45)" }}
      >
        {group.explanation} · confidence {Math.round(group.confidence * 100)}%
      </p>

      {/* Members list — click to select preferred original */}
      <div className="space-y-2 mb-4">
        {(expanded ? group.members : group.members.slice(0, 4)).map((member) => {
          const isPreferred = member.findingId === preferredId;
          return (
            <button
              key={member.findingId}
              onClick={() => setPreferredId(member.findingId)}
              className="w-full text-left p-3 rounded transition-colors duration-150"
              style={{
                background: isPreferred ? "rgba(52, 211, 153, 0.08)" : "rgba(255,255,255,0.04)",
                border: isPreferred ? "1px solid rgba(52, 211, 153, 0.4)" : "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white truncate">{member.name}</span>
                    {isPreferred && (
                      <span
                        className="text-xs font-mono px-1.5 py-0.5 rounded shrink-0"
                        style={{ background: "#34D399", color: "#111111", fontWeight: 600 }}
                      >
                        KEEP
                      </span>
                    )}
                  </div>
                  <div
                    className="text-xs font-mono truncate mt-0.5"
                    style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                  >
                    {member.path}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className="text-xs font-mono"
                    style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                  >
                    {formatBytes(member.sizeBytes)}
                  </div>
                  {member.modifiedAt && (
                    <div
                      className="text-xs font-mono mt-0.5"
                      style={{ color: "rgba(255,255,255,0.25)", fontFamily: "var(--app-font-mono)" }}
                    >
                      {new Date(member.modifiedAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {group.members.length > 4 && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="text-xs font-mono"
            style={{ color: "rgba(255,255,255,0.35)", fontFamily: "var(--app-font-mono)" }}
          >
            {expanded ? "Show fewer" : `Show all ${group.members.length} files`}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onResolve(group.id, { action: "keep_one", keepFindingId: preferredId })}
          disabled={isPending || preferredId == null}
          className="text-xs px-3 py-1.5 rounded transition-colors duration-150 disabled:opacity-40"
          style={{ background: "#34D399", color: "#111111", fontWeight: 600 }}
        >
          Keep Selected
        </button>
        <button
          onClick={() => onResolve(group.id, { action: "ignore" })}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded transition-colors duration-150"
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Ignore
        </button>
        <button
          onClick={() => onResolve(group.id, { action: "false_positive" })}
          disabled={isPending}
          className="text-xs px-3 py-1.5 rounded transition-colors duration-150"
          style={{
            background: "transparent",
            color: "rgba(255,255,255,0.3)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          Not a duplicate
        </button>
      </div>
    </motion.div>
  );
}

export default function Organise() {
  const queryClient = useQueryClient();

  const { data: dupData, isLoading: dupsLoading } = useListDuplicates(
    { status: "pending", sort: "wastedBytes", limit: 50 },
    { query: { queryKey: getListDuplicatesQueryKey({ status: "pending", sort: "wastedBytes", limit: 50 }), refetchInterval: 10000 } }
  );

  const { data: corruptedData } = useListFiles(
    { status: "action_required", limit: 50 },
    {}
  );

  const { data: corruptedFiles } = useListFiles(
    { status: "corrupted", limit: 50 },
    {}
  );

  const resolve = useResolveDuplicate({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListDuplicatesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardNeedsAttentionQueryKey() });
      },
    },
  });

  const groups = dupData?.groups ?? [];
  const totalSaveable = dupData?.totalSaveable ?? 0;
  const allCorrupted = [...(corruptedData?.files ?? []), ...(corruptedFiles?.files ?? [])];

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-xl font-semibold text-white">Organise</h1>
          {totalSaveable > 0 && (
            <p
              className="text-xs font-mono mt-1"
              style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
            >
              {formatBytes(totalSaveable)} RECOVERABLE IF ALL DUPLICATES RESOLVED
            </p>
          )}
        </div>
      </div>

      {/* Duplicates section — sorted by wasted space, largest first */}
      <div className="mb-8">
        <h2
          className="text-xs tracking-widest uppercase mb-4"
          style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
        >
          Duplicates · {groups.length} groups
        </h2>

        {dupsLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded animate-pulse" style={{ background: "#222222" }} />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="sentinel-card p-6 text-center">
            <p
              className="text-xs font-mono"
              style={{ color: "#34D399", fontFamily: "var(--app-font-mono)" }}
            >
              ✓ NO DUPLICATES
            </p>
            <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.4)" }}>
              All duplicate groups have been resolved.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence>
              {groups.map((group, i) => (
                <DuplicateGroupCard
                  key={group.id}
                  group={group}
                  index={i}
                  isPending={resolve.isPending}
                  onResolve={(id, data) => resolve.mutate({ id, data })}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Corrupted files */}
      {allCorrupted.length > 0 && (
        <div>
          <h2
            className="text-xs tracking-widest uppercase mb-4"
            style={{ color: "#F87171", fontFamily: "var(--app-font-mono)" }}
          >
            Action Required · {allCorrupted.length} files
          </h2>
          <div className="space-y-2">
            {allCorrupted.map((file) => (
              <div
                key={file.id}
                className="flex items-center gap-4 px-4 py-3 rounded"
                style={{
                  background: "#222222",
                  border: "1px solid rgba(248, 113, 113, 0.2)",
                }}
              >
                <span
                  className="text-xs font-mono shrink-0 px-2 py-0.5 rounded"
                  style={{
                    background: "rgba(248, 113, 113, 0.12)",
                    color: "#F87171",
                    fontFamily: "var(--app-font-mono)",
                  }}
                >
                  {statusLabel(file.status)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-white truncate">{file.name}</div>
                  <div
                    className="text-xs font-mono truncate"
                    style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                  >
                    {file.path}
                  </div>
                </div>
                <span
                  className="text-xs font-mono shrink-0"
                  style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)" }}
                >
                  {formatBytes(file.sizeBytes)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
