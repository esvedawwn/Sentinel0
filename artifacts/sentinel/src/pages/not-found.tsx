import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-24">
      <span
        className="text-6xl font-mono mb-4"
        style={{ color: "rgba(255,255,255,0.1)", fontFamily: "var(--app-font-mono)" }}
      >
        404
      </span>
      <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
        Page not found.
      </p>
      <Link href="/dashboard">
        <span className="text-sm underline cursor-pointer" style={{ color: "#34D399" }}>
          Go to Dashboard
        </span>
      </Link>
    </div>
  );
}
