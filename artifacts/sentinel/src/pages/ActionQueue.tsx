import { motion } from "framer-motion";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListActionQueue,
  useDismissActionQueueItem,
  getListActionQueueQueryKey,
} from "@workspace/api-client-react";

const STATUS_COLORS: Record<string, string> = {
  pending: "#FBBF24",
  dismissed: "rgba(255,255,255,0.3)",
  completed: "#34D399",
};

const ACTION_TYPE_COLORS: Record<string, string> = {
  move: "#60A5FA",
  archive: "#A78BFA",
  delete: "#F87171",
  keep: "#34D399",
};

export default function ActionQueue() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useListActionQueue(
    {},
    { query: { queryKey: getListActionQueueQueryKey({}), refetchInterval: 8000 } }
  );

  const dismiss = useDismissActionQueueItem({
    mutation: {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListActionQueueQueryKey() }),
    },
  });

  const items = data?.items ?? [];
  const pending = items.filter((i) => i.status === "pending");

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Action Queue</h1>
        <p
          className="text-xs font-mono mt-1"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
        >
          PROPOSED ACTIONS AWAITING CONFIRMATION · NOTHING HERE IS EXECUTED AUTOMATICALLY
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-sm" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading…
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg p-12 text-center"
          style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="text-white font-medium mb-2">Queue is empty</div>
          <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "0.875rem" }}>
            Accept an AI recommendation from{" "}
            <Link href="/findings">
              <span style={{ color: "#34D399", cursor: "pointer" }}>Findings</span>
            </Link>{" "}
            to queue a proposed action here.
          </div>
        </div>
      ) : (
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          {items.map((item, idx) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(idx * 0.02, 0.3) }}
              className="flex items-center justify-between px-4 py-3"
              style={{
                background: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}
            >
              <div className="min-w-0 pr-4 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-mono"
                    style={{
                      background: `${ACTION_TYPE_COLORS[item.actionType] ?? "#888"}22`,
                      color: ACTION_TYPE_COLORS[item.actionType] ?? "#888",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    {item.actionType}
                  </span>
                  <span
                    className="inline-block px-2 py-0.5 rounded text-xs font-mono"
                    style={{
                      background: `${STATUS_COLORS[item.status] ?? "#888"}22`,
                      color: STATUS_COLORS[item.status] ?? "#888",
                      fontFamily: "var(--app-font-mono)",
                    }}
                  >
                    {item.status}
                  </span>
                </div>
                <div className="text-sm text-white">{item.description}</div>
                {item.proposedDestination && (
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: "rgba(255,255,255,0.4)", fontFamily: "var(--app-font-mono)", fontSize: "0.7rem" }}
                  >
                    → {item.proposedDestination}
                  </div>
                )}
              </div>
              {item.status === "pending" && (
                <button
                  onClick={() => dismiss.mutate({ id: item.id })}
                  disabled={dismiss.isPending}
                  className="text-xs px-3 py-1.5 rounded shrink-0"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                >
                  Dismiss
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {pending.length > 0 && (
        <p className="text-xs mt-4" style={{ color: "rgba(255,255,255,0.25)", lineHeight: 1.6 }}>
          {pending.length} pending {pending.length === 1 ? "action" : "actions"}. Dismissing an action never
          executes it — it only removes it from the queue. Sentinel never moves, deletes, or modifies files
          automatically.
        </p>
      )}
    </div>
  );
}
