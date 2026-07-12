import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetSettings,
  useUpdateSettings,
  useListScanRoots,
  useCreateScanRoot,
  useDeleteScanRoot,
  useGetAIStatus,
  getGetAIStatusQueryKey,
  getGetSettingsQueryKey,
  getListScanRootsQueryKey,
} from "@workspace/api-client-react";
import { Trash2, FolderPlus } from "lucide-react";
import { isDesktop, pickFolder } from "@/lib/desktop";
import { formatTimestamp } from "@/lib/utils";

interface SettingRowProps {
  label: string;
  description: string;
  children: React.ReactNode;
}

function SettingRow({ label, description, children }: SettingRowProps) {
  return (
    <div
      className="flex items-start justify-between py-4"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex-1 pr-8">
        <div className="text-sm font-medium text-white">{label}</div>
        <div className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
          {description}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div
      className="text-xs tracking-widest uppercase pt-6 pb-2"
      style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
    >
      {title}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  disabled = false,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className="relative w-9 h-5 rounded-full transition-colors duration-200"
      style={{
        background: enabled ? "#34D399" : "rgba(255,255,255,0.12)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform duration-200"
        style={{
          background: "#ffffff",
          transform: enabled ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "red" | "neutral" }) {
  const colors: Record<typeof tone, { bg: string; fg: string }> = {
    green: { bg: "rgba(52,211,153,0.15)", fg: "#34D399" },
    amber: { bg: "rgba(245,158,11,0.15)", fg: "#F59E0B" },
    red: { bg: "rgba(248,113,113,0.15)", fg: "#F87171" },
    neutral: { bg: "rgba(255,255,255,0.08)", fg: "rgba(255,255,255,0.5)" },
  };
  const c = colors[tone];
  return (
    <span
      className="text-xs font-mono px-2 py-0.5 rounded"
      style={{ background: c.bg, color: c.fg, fontFamily: "var(--app-font-mono)" }}
    >
      {label}
    </span>
  );
}

const DEFAULT_SKIP_DIRS = [
  "node_modules", ".git", "dist", "build", ".cache", ".next", ".nuxt",
  ".turbo", "coverage", ".venv", "venv", "__pycache__", ".pnpm-store",
];

// ── Scan Roots Section ────────────────────────────────────────────────────────

function ScanRootsSection() {
  const queryClient = useQueryClient();
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  const { data, isLoading } = useListScanRoots({
    query: { queryKey: getListScanRootsQueryKey() },
  });

  const createRoot = useCreateScanRoot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScanRootsQueryKey() });
        setNewPath("");
        setNewLabel("");
        setShowAddForm(false);
      },
    },
  });

  const deleteRoot = useDeleteScanRoot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListScanRootsQueryKey() });
      },
    },
  });

  const handleBrowse = async () => {
    const folder = await pickFolder();
    if (folder) {
      setNewPath(folder);
      setShowAddForm(true);
    }
  };

  const handleAdd = () => {
    if (!newPath.trim()) return;
    createRoot.mutate({ data: { path: newPath.trim(), label: newLabel.trim() || undefined } });
  };

  const roots = data?.roots ?? [];

  return (
    <div
      className="rounded-lg px-5"
      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between">
        <SectionHeader title="Approved Scan Roots" />
        <div className="flex items-center gap-2 pt-4">
          {isDesktop() && (
            <button
              onClick={handleBrowse}
              className="flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded transition-colors"
              style={{
                background: "rgba(52,211,153,0.08)",
                color: "#34D399",
                border: "1px solid rgba(52,211,153,0.2)",
                fontFamily: "var(--app-font-mono)",
              }}
            >
              <FolderPlus size={12} />
              Browse…
            </button>
          )}
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-mono px-3 py-1 rounded transition-colors"
            style={{
              background: showAddForm ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontFamily: "var(--app-font-mono)",
            }}
          >
            {showAddForm ? "Cancel" : "Add Path"}
          </button>
        </div>
      </div>

      <p className="text-xs pb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
        Folders registered here appear in the quick-launch list when starting a new scan.
        {isDesktop() && " Use Browse… to pick a folder with the native dialog."}
      </p>

      {/* Add form */}
      {showAddForm && (
        <div
          className="flex flex-col gap-2 p-3 mb-3 rounded-md"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
        >
          <input
            type="text"
            placeholder="/path/to/folder"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
            className="w-full px-3 py-1.5 rounded text-xs outline-none font-mono"
            style={{
              background: "#222222",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#ffffff",
              fontFamily: "var(--app-font-mono)",
            }}
          />
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Label (optional)"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="flex-1 px-3 py-1.5 rounded text-xs outline-none font-mono"
              style={{
                background: "#222222",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "rgba(255,255,255,0.7)",
                fontFamily: "var(--app-font-mono)",
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!newPath.trim() || createRoot.isPending}
              className="px-4 py-1.5 text-xs font-mono rounded transition-colors"
              style={{
                background: newPath.trim() ? "#34D399" : "rgba(255,255,255,0.06)",
                color: newPath.trim() ? "#111111" : "rgba(255,255,255,0.3)",
                cursor: newPath.trim() ? "pointer" : "not-allowed",
                fontFamily: "var(--app-font-mono)",
              }}
            >
              {createRoot.isPending ? "Adding…" : "Add"}
            </button>
          </div>
          {createRoot.isError && (
            <p className="text-xs" style={{ color: "#F87171" }}>
              {(createRoot.error as { message?: string })?.message ?? "Failed to add root."}
            </p>
          )}
        </div>
      )}

      {/* Roots list */}
      {isLoading && (
        <div className="py-4 text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading scan roots…
        </div>
      )}

      {!isLoading && roots.length === 0 && (
        <div className="py-4 text-xs text-center" style={{ color: "rgba(255,255,255,0.25)" }}>
          No scan roots registered yet. Add a folder above to get started.
        </div>
      )}

      {roots.map((root) => (
        <div
          key={root.id}
          className="flex items-center justify-between py-3"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
        >
          <div className="flex-1 min-w-0 pr-4">
            <div
              className="text-xs font-mono truncate"
              style={{ color: "#ffffff", fontFamily: "var(--app-font-mono)" }}
              title={root.path}
            >
              {root.label ? (
                <>
                  <span style={{ color: "#34D399" }}>{root.label}</span>
                  <span style={{ color: "rgba(255,255,255,0.3)" }}> · </span>
                </>
              ) : null}
              {root.path}
            </div>
            <div className="flex gap-3 mt-0.5">
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}>
                {root.scanCount} {root.scanCount === 1 ? "scan" : "scans"}
              </span>
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)", fontFamily: "var(--app-font-mono)" }}>
                {formatTimestamp(root.lastScannedAt)}
              </span>
            </div>
          </div>
          <button
            onClick={() => deleteRoot.mutate({ id: root.id })}
            disabled={deleteRoot.isPending}
            className="p-1.5 rounded transition-colors"
            style={{ color: "rgba(248,113,113,0.5)" }}
            title="Remove scan root"
          >
            <Trash2 size={13} />
          </button>
        </div>
      ))}

      <div className="pb-2" />
    </div>
  );
}

// ── Processing & Privacy Section ──────────────────────────────────────────────

function ProcessingPrivacySection() {
  const queryClient = useQueryClient();

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() },
  });

  const updateSettings = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
    },
  });

  const patch = (fields: Record<string, boolean>) => {
    updateSettings.mutate({ data: fields });
  };

  const isSaving = updateSettings.isPending;

  return (
    <div
      className="rounded-lg px-5"
      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between">
        <SectionHeader title="Processing & Privacy" />
        {isSaving && (
          <span
            className="text-[10px] font-mono pt-4"
            style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
          >
            Saving…
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="py-4 text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Loading settings…
        </div>
      ) : (
        <>
          <SettingRow
            label="Text Extraction"
            description="Extract text content from documents (TXT, CSV, JSON, PDF, source code) for full-text search and entity detection."
          >
            <Toggle
              enabled={settings?.textExtractionEnabled ?? false}
              onChange={(v) => patch({ textExtractionEnabled: v })}
              disabled={isSaving}
            />
          </SettingRow>

          <SettingRow
            label="OCR (Optical Character Recognition)"
            description="Run OCR on scanned PDFs and images to extract text. Requires text extraction to be enabled."
          >
            <Toggle
              enabled={settings?.ocrEnabled ?? false}
              onChange={(v) => patch({ ocrEnabled: v })}
              disabled={isSaving || !(settings?.textExtractionEnabled)}
            />
          </SettingRow>

          <SettingRow
            label="Local-Only Processing"
            description="All classification and extraction runs entirely on-device. No file contents or metadata are sent to external services. Disabling requires explicit cloud consent."
          >
            <div className="flex items-center gap-2">
              <StatusPill
                label={settings?.localOnlyProcessing ? "ENFORCED" : "CLOUD ALLOWED"}
                tone={settings?.localOnlyProcessing ? "green" : "amber"}
              />
              <Toggle
                enabled={settings?.localOnlyProcessing ?? true}
                onChange={(v) => {
                  if (!v) {
                    // Disabling local-only requires cloud consent in the same request
                    patch({ localOnlyProcessing: false, cloudConsent: true });
                  } else {
                    patch({ localOnlyProcessing: true });
                  }
                }}
                disabled={isSaving}
              />
            </div>
          </SettingRow>

          {!settings?.localOnlyProcessing && (
            <SettingRow
              label="Cloud Consent"
              description="Grants permission for cloud AI providers to be used. Only relevant when local-only processing is disabled."
            >
              <Toggle
                enabled={settings?.cloudConsent ?? false}
                onChange={(v) => patch({ cloudConsent: v })}
                disabled={isSaving}
              />
            </SettingRow>
          )}
        </>
      )}

      <p className="text-xs pb-4 pt-2" style={{ color: "rgba(255,255,255,0.2)" }}>
        Settings are persisted to the database and apply immediately. No file contents are ever stored — only
        path, size, and classification metadata.
      </p>
    </div>
  );
}

// ── Detection Section (UI-only) ───────────────────────────────────────────────

function DetectionSection() {
  const [hashDuplicates, setHashDuplicates] = useState(true);
  const [detectEmpty, setDetectEmpty] = useState(true);
  const [detectLock, setDetectLock] = useState(true);
  const [detectInstallers, setDetectInstallers] = useState(true);
  const [detectArchives, setDetectArchives] = useState(true);
  const [detectLarge, setDetectLarge] = useState(true);
  const [largeFileMb, setLargeFileMb] = useState("50");

  return (
    <div
      className="rounded-lg px-5"
      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <SectionHeader title="Findings Detection" />

      <SettingRow
        label="Duplicate Detection"
        description="Hash files (SHA-256, staged pipeline) to find exact duplicates."
      >
        <Toggle enabled={hashDuplicates} onChange={setHashDuplicates} />
      </SettingRow>

      <SettingRow
        label="Empty Folders"
        description="Flag directories with no contents (excluding hidden system files)."
      >
        <Toggle enabled={detectEmpty} onChange={setDetectEmpty} />
      </SettingRow>

      <SettingRow
        label="Lock Files (.idlk, .locked)"
        description="Flag Adobe InDesign lock files and generic application locks."
      >
        <Toggle enabled={detectLock} onChange={setDetectLock} />
      </SettingRow>

      <SettingRow
        label="Installers (.dmg, .pkg, .exe, .msi…)"
        description="Flag installer packages that are typically safe to delete after use."
      >
        <Toggle enabled={detectInstallers} onChange={setDetectInstallers} />
      </SettingRow>

      <SettingRow
        label="Archives (.zip, .rar, .7z, .tar…)"
        description="Flag compressed archives for review."
      >
        <Toggle enabled={detectArchives} onChange={setDetectArchives} />
      </SettingRow>

      <SettingRow
        label="Large Files"
        description="Flag files that exceed the size threshold below."
      >
        <Toggle enabled={detectLarge} onChange={setDetectLarge} />
      </SettingRow>

      {detectLarge && (
        <SettingRow
          label="Large File Threshold"
          description="Files larger than this size are flagged for review."
        >
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="10000"
              value={largeFileMb}
              onChange={(e) => setLargeFileMb(e.target.value)}
              className="w-20 px-2 py-1 rounded text-sm text-right outline-none"
              style={{
                background: "#222222",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#ffffff",
                fontFamily: "var(--app-font-mono)",
              }}
            />
            <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>MB</span>
          </div>
        </SettingRow>
      )}

      <SectionHeader title="Scanner Behaviour" />

      <SettingRow
        label="Skip Directories"
        description="These directories are always excluded from scans."
      >
        <span
          className="text-xs font-mono px-2 py-0.5 rounded"
          style={{
            background: "rgba(255,255,255,0.06)",
            color: "rgba(255,255,255,0.4)",
            fontFamily: "var(--app-font-mono)",
          }}
        >
          {DEFAULT_SKIP_DIRS.length} directories
        </span>
      </SettingRow>

      <div className="py-3">
        <div className="flex flex-wrap gap-1.5">
          {DEFAULT_SKIP_DIRS.map((dir) => (
            <span
              key={dir}
              className="text-xs font-mono px-2 py-0.5 rounded"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.08)",
                fontFamily: "var(--app-font-mono)",
              }}
            >
              {dir}
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs pb-3 pt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
        Detection toggle persistence is planned for v0.2. Current values are runtime defaults.
      </p>
    </div>
  );
}

// ── AI Diagnostics Panel ──────────────────────────────────────────────────────

function AIDiagnosticsPanel() {
  const { data: status, isLoading, isError } = useGetAIStatus({
    query: { queryKey: getGetAIStatusQueryKey(), refetchInterval: 5000 },
  });

  return (
    <div
      className="rounded-lg px-5"
      style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <SectionHeader title="AI Diagnostics (developer)" />

      {isLoading && (
        <div className="py-4 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Loading AI status…
        </div>
      )}
      {isError && (
        <div className="py-4 text-xs" style={{ color: "#F87171" }}>
          Unable to reach the AI status endpoint.
        </div>
      )}
      {status && (
        <div className="py-2">
          <SettingRow label="Active Provider" description="The classifier currently used for new findings.">
            <span className="text-xs font-mono" style={{ color: "#ffffff", fontFamily: "var(--app-font-mono)" }}>
              {status.provider}
            </span>
          </SettingRow>
          <SettingRow label="Mode" description="Whether classification runs offline or against a cloud provider.">
            <StatusPill
              label={status.status === "local" ? "LOCAL (offline)" : status.status.toUpperCase()}
              tone={status.status === "local" ? "green" : status.status === "cloud" ? "amber" : "neutral"}
            />
          </SettingRow>
          <SettingRow label="Cloud AI Enabled" description="True only when an operator has configured an API key.">
            <StatusPill label={status.cloudEnabled ? "ENABLED" : "DISABLED (default)"} tone={status.cloudEnabled ? "amber" : "green"} />
          </SettingRow>
          <SettingRow label="Provider Availability" description="Availability check for every registered provider.">
            <div className="flex gap-1.5">
              {Object.entries(status.providerAvailability).map(([name, available]) => (
                <StatusPill key={name} label={`${name}: ${available ? "up" : "down"}`} tone={available ? "green" : "neutral"} />
              ))}
            </div>
          </SettingRow>
          <SettingRow label="Last AI Error" description="Message from the most recent provider failure, if any.">
            {status.lastError ? (
              <span className="text-xs font-mono" style={{ color: "#F87171", fontFamily: "var(--app-font-mono)" }}>
                {status.lastError}
              </span>
            ) : (
              <StatusPill label="None" tone="green" />
            )}
          </SettingRow>
          <SettingRow label="Last Classification Duration" description="How long the most recent classification call took.">
            <span className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--app-font-mono)" }}>
              {status.lastClassificationDurationMs === null ? "—" : `${status.lastClassificationDurationMs} ms`}
            </span>
          </SettingRow>
        </div>
      )}
      <p className="text-xs pb-4 pt-1" style={{ color: "rgba(255,255,255,0.2)" }}>
        AI classification is local-only by default. No file contents are ever uploaded, and AI
        recommendations are preview-only — they never delete, move, or rename files automatically.
      </p>
    </div>
  );
}

// ── Main Settings Page ────────────────────────────────────────────────────────

export default function Settings() {
  const desktop = isDesktop();

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p
          className="text-xs font-mono mt-1"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
        >
          SCAN CONFIGURATION · SENTINEL v0.2-α{desktop ? " · DESKTOP" : ""}
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <ScanRootsSection />
        <ProcessingPrivacySection />
        <DetectionSection />
        <AIDiagnosticsPanel />

        {/* About */}
        <div
          className="rounded-lg px-5"
          style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <SectionHeader title="About" />
          <div className="py-4 space-y-2">
            {[
              ["Version", "0.2.0-alpha"],
              ["Build", "Sprint 2 — Desktop Alpha"],
              ["Database", "SQLite · Drizzle ORM"],
              ["Scanner", "Real filesystem · SHA-256 dedup"],
              ["AI", "LocalRuleProvider (offline)"],
              ["Mode", desktop ? "Desktop (Tauri)" : "Web (browser)"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-4">
                <span
                  className="text-xs font-mono w-24 shrink-0"
                  style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
                >
                  {k}
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: "rgba(255,255,255,0.6)", fontFamily: "var(--app-font-mono)" }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
