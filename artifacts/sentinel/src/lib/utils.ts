import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)} ${sizes[i]}`;
}

export function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toTimeString().slice(0, 8);
  }

  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

export function statusColor(status: string): string {
  switch (status) {
    case "ready":
    case "success":
    case "completed":
      return "#34D399";
    case "review":
    case "warning":
      return "#FBBF24";
    case "action_required":
    case "error":
    case "failed":
    case "corrupted":
      return "#F87171";
    case "running":
    case "info":
    case "scanning":
      return "#60A5FA";
    default:
      return "rgba(255,255,255,0.5)";
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "ready": return "READY";
    case "review": return "REVIEW";
    case "action_required": return "ACTION REQUIRED";
    case "corrupted": return "CORRUPTED";
    case "running": return "IN PROGRESS";
    case "completed": return "COMPLETE";
    case "cancelled": return "CANCELLED";
    case "failed": return "FAILED";
    case "pending": return "PENDING";
    case "resolved": return "RESOLVED";
    case "ignored": return "IGNORED";
    default: return status.toUpperCase().replace(/_/g, " ");
  }
}

export function activityIcon(status: string): string {
  switch (status) {
    case "success": return "✓";
    case "warning": return "⚠";
    case "info": return "›";
    case "error": return "✕";
    default: return "›";
  }
}
