import { useState } from "react";

/**
 * The assigned agent's photo, or their initials when they have none (or it
 * fails to load). Kept small and dependency-free for the widget bundle.
 */
export function AgentAvatar({
  apiUrl,
  name,
  photo,
  size = 32,
  online,
}: {
  apiUrl: string;
  name: string;
  photo: string | null;
  size?: number;
  online?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {photo && !failed ? (
        <img
          src={`${apiUrl}${photo}`}
          alt=""
          onError={() => setFailed(true)}
          className="h-full w-full rounded-full bg-slate-100 object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center rounded-full bg-slate-900 font-semibold text-white"
          style={{ fontSize: Math.max(10, Math.round(size * 0.38)) }}
        >
          {initials || "?"}
        </span>
      )}
      {online !== undefined && (
        <span
          aria-hidden="true"
          className={[
            "absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full ring-2 ring-white",
            online ? "bg-emerald-500" : "bg-slate-300",
          ].join(" ")}
        />
      )}
    </span>
  );
}
