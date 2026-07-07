import { useState } from "react";

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
        <div
          className="text-xs mt-0.5"
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
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
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!enabled)}
      className="relative w-9 h-5 rounded-full transition-colors duration-200"
      style={{
        background: enabled ? "#34D399" : "rgba(255,255,255,0.12)",
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

const DEFAULT_SKIP_DIRS = [
  "node_modules",
  ".git",
  "dist",
  "build",
  ".cache",
  ".next",
  ".nuxt",
  ".turbo",
  "coverage",
  ".venv",
  "venv",
  "__pycache__",
  ".pnpm-store",
];

export default function Settings() {
  const [hashDuplicates, setHashDuplicates] = useState(true);
  const [detectEmpty, setDetectEmpty] = useState(true);
  const [detectLock, setDetectLock] = useState(true);
  const [detectInstallers, setDetectInstallers] = useState(true);
  const [detectArchives, setDetectArchives] = useState(true);
  const [detectLarge, setDetectLarge] = useState(true);
  const [largeFileMb, setLargeFileMb] = useState("50");
  const [saved, setSaved] = useState(false);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Settings</h1>
        <p
          className="text-xs font-mono mt-1"
          style={{ color: "rgba(255,255,255,0.3)", fontFamily: "var(--app-font-mono)" }}
        >
          SCAN CONFIGURATION · SENTINEL v0.1-α
        </p>
      </div>

      <div
        className="rounded-lg px-5"
        style={{
          background: "#1A1A1A",
          border: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <SectionHeader title="Findings Detection" />

        <SettingRow
          label="Duplicate Detection"
          description="Hash files (MD5) to find exact duplicates. Skips files over 100 MB."
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
              <span
                className="text-xs font-mono"
                style={{ color: "rgba(255,255,255,0.4)" }}
              >
                MB
              </span>
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
          <div
            className="flex flex-wrap gap-1.5"
          >
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

        <SectionHeader title="About" />

        <div className="py-4 space-y-2">
          {[
            ["Version", "0.1.0-alpha"],
            ["Build", "Sprint 1 — Foundation"],
            ["Database", "PostgreSQL + Drizzle ORM"],
            ["Scanner", "Real filesystem, MD5 dedup"],
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

      <div className="flex justify-end mt-6">
        <button
          onClick={handleSave}
          className="px-5 py-2 text-sm font-medium rounded transition-colors duration-150"
          style={{
            background: saved ? "rgba(52,211,153,0.2)" : "#34D399",
            color: saved ? "#34D399" : "#111111",
            border: saved ? "1px solid rgba(52,211,153,0.4)" : "none",
          }}
        >
          {saved ? "Saved ✓" : "Save Settings"}
        </button>
      </div>

      <p
        className="text-xs mt-4 text-center"
        style={{ color: "rgba(255,255,255,0.2)", fontFamily: "var(--app-font-mono)" }}
      >
        Settings persistence ships in v0.2. Values shown are current runtime defaults.
      </p>
    </div>
  );
}
