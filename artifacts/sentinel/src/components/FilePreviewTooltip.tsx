/**
 * FilePreviewTooltip — lo-res file preview card on hover.
 *
 * Shows a pixelated, blurred colour-grid "thumbnail" generated deterministically
 * from the filename, so every file gets a consistent unique look without
 * storing any actual file content.  Metadata rows (size, category, path) appear
 * below the preview area.
 *
 * Usage: wrap any file row element with this component.
 */

import { useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { formatBytes } from "@/lib/utils";

export interface FilePreviewInfo {
  name: string;
  path: string;
  extension?: string | null;
  sizeBytes?: number;
  category?: string | null;
  aiCategory?: string | null;
  status?: string | null;
  riskLevel?: string | null;
}

interface Props extends FilePreviewInfo {
  children: React.ReactNode;
  /** Tooltip appears after this delay in ms (default 280) */
  delayMs?: number;
}

// ── colour palette ──────────────────────────────────────────────────────────

function extColor(ext: string | null | undefined): string {
  const e = (ext ?? "").toLowerCase().replace(/^\./, "");
  if (["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp", "ico", "tiff", "heic"].includes(e))
    return "#A78BFA";
  if (["mp4", "mov", "avi", "mkv", "webm", "m4v"].includes(e)) return "#F87171";
  if (["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(e)) return "#F9A8D4";
  if (
    ["js", "ts", "tsx", "jsx", "py", "rs", "go", "rb", "java", "cpp", "c", "h", "cs", "php", "sh", "sql", "swift", "kt"].includes(e)
  )
    return "#FBBF24";
  if (["csv", "xlsx", "xls", "json", "xml", "yaml", "yml", "toml"].includes(e)) return "#34D399";
  if (["zip", "tar", "gz", "7z", "rar", "bz2"].includes(e)) return "#FB923C";
  if (["pdf", "doc", "docx", "txt", "md", "rtf", "odt", "pages"].includes(e)) return "#60A5FA";
  return "#94A3B8";
}

function categoryColor(cat: string | null | undefined): string {
  const c = (cat ?? "").toLowerCase();
  if (c.includes("image") || c.includes("photo")) return "#A78BFA";
  if (c.includes("video")) return "#F87171";
  if (c.includes("audio")) return "#F9A8D4";
  if (c.includes("code") || c.includes("source") || c.includes("script")) return "#FBBF24";
  if (c.includes("spread") || c.includes("data")) return "#34D399";
  if (c.includes("archive") || c.includes("compress")) return "#FB923C";
  if (c.includes("document") || c.includes("pdf") || c.includes("text")) return "#60A5FA";
  return "#94A3B8";
}

function baseColor(ext: string | null | undefined, cat: string | null | undefined): string {
  const e = extColor(ext);
  return e !== "#94A3B8" ? e : categoryColor(cat);
}

// ── deterministic pixel grid ─────────────────────────────────────────────────

function fnv1a(str: string, seed = 0): number {
  let h = (0x811c9dc5 + seed) >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function pixelColors(name: string, colorHex: string, cols: number, rows: number): string[] {
  const [br, bg, bb] = hexToRgb(colorHex);
  return Array.from({ length: cols * rows }, (_, i) => {
    const h1 = fnv1a(name, i * 7);
    const h2 = fnv1a(name, i * 13 + 31);
    const rOff = (((h1 & 0xff) / 255) - 0.5) * 120;
    const gOff = ((((h1 >> 8) & 0xff) / 255) - 0.5) * 120;
    const bOff = ((((h1 >> 16) & 0xff) / 255) - 0.5) * 120;
    const alpha = 0.18 + ((h2 & 0xff) / 255) * 0.55;
    const r = Math.round(Math.max(0, Math.min(255, br + rOff)));
    const g = Math.round(Math.max(0, Math.min(255, bg + gOff)));
    const b = Math.round(Math.max(0, Math.min(255, bb + bOff)));
    return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
  });
}

// ── components ───────────────────────────────────────────────────────────────

const COLS = 10;
const ROWS = 6;
const TIP_W = 264;

interface PillProps {
  label: string;
  color: string;
}

function Pill({ label, color }: PillProps) {
  return (
    <span
      style={{
        fontSize: 9,
        fontFamily: "var(--app-font-mono)",
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
        color: "rgba(255,255,255,0.65)",
        background: `${color}28`,
        border: `1px solid ${color}40`,
        borderRadius: 3,
        padding: "1px 5px",
        whiteSpace: "nowrap" as const,
      }}
    >
      {label}
    </span>
  );
}

interface TooltipContentProps extends FilePreviewInfo {
  x: number;
  y: number;
}

function TooltipContent({ name, path, extension, sizeBytes, category, aiCategory, riskLevel, x, y }: TooltipContentProps) {
  const color = baseColor(extension, category);
  const pixels = pixelColors(name, color, COLS, ROWS);
  const ext = (extension ?? "FILE").replace(/^\./, "").toUpperCase().slice(0, 6);

  const safeX = x + 18 + TIP_W > window.innerWidth ? x - TIP_W - 12 : x + 18;
  const safeY = Math.min(y - 10, window.innerHeight - 240);

  return (
    <div
      style={{
        position: "fixed",
        left: safeX,
        top: safeY,
        width: TIP_W,
        zIndex: 99999,
        background: "#1A1A1A",
        border: "1px solid rgba(255,255,255,0.12)",
        borderRadius: 8,
        boxShadow: "0 20px 48px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)",
        overflow: "hidden",
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {/* Lo-res preview area */}
      <div style={{ position: "relative", height: 88, background: "#0a0a0a", overflow: "hidden" }}>
        {/* Pixel grid — blurred and slightly over-scaled for bleeding effect */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows: `repeat(${ROWS}, 1fr)`,
            width: "108%",
            height: "108%",
            position: "absolute",
            top: "-4%",
            left: "-4%",
            filter: "blur(4px) saturate(1.8) brightness(0.9)",
          }}
        >
          {pixels.map((c, i) => (
            <div key={i} style={{ background: c }} />
          ))}
        </div>

        {/* Radial vignette */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 50%, transparent 20%, rgba(0,0,0,0.55) 100%)",
          }}
        />

        {/* Extension badge */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span
            style={{
              fontSize: 26,
              fontWeight: 700,
              fontFamily: "var(--app-font-mono)",
              color: "rgba(255,255,255,0.90)",
              textShadow: "0 0 20px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.8)",
              letterSpacing: "0.08em",
            }}
          >
            {ext}
          </span>
        </div>

        {/* Colour accent line at bottom */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
            opacity: 0.8,
          }}
        />
      </div>

      {/* Metadata */}
      <div style={{ padding: "9px 11px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 500,
            color: "rgba(255,255,255,0.9)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 10,
            fontFamily: "var(--app-font-mono)",
            color: "rgba(255,255,255,0.28)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {path}
        </div>
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 1 }}>
          {sizeBytes !== undefined && sizeBytes > 0 && (
            <Pill label={formatBytes(sizeBytes)} color={color} />
          )}
          {category && <Pill label={category} color="rgba(255,255,255,0.3)" />}
          {aiCategory && aiCategory !== category && (
            <Pill label={aiCategory} color="rgba(255,255,255,0.2)" />
          )}
          {riskLevel && riskLevel !== "none" && riskLevel !== "low" && (
            <Pill
              label={riskLevel}
              color={riskLevel === "critical" || riskLevel === "high" ? "#F87171" : "#FBBF24"}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── main export ───────────────────────────────────────────────────────────────

export default function FilePreviewTooltip({
  children,
  delayMs = 280,
  ...fileInfo
}: Props) {
  const [state, setState] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onEnter = useCallback(
    (e: React.MouseEvent) => {
      const { clientX: x, clientY: y } = e;
      timerRef.current = setTimeout(() => {
        setState({ visible: true, x, y });
      }, delayMs);
    },
    [delayMs]
  );

  const onLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState((s) => ({ ...s, visible: false }));
  }, []);

  return (
    <>
      <div onMouseEnter={onEnter} onMouseLeave={onLeave} style={{ display: "contents" }}>
        {children}
      </div>
      {state.visible &&
        createPortal(
          <TooltipContent {...fileInfo} x={state.x} y={state.y} />,
          document.body
        )}
    </>
  );
}
