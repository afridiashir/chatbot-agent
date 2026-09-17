import { useState } from "react";

/**
 * The agent's photo, or WhatsApp's grey default silhouette when they have none
 * (or it fails to load). Dependency-free for the widget bundle.
 */
export function AgentAvatar({
  apiUrl,
  name,
  photo,
  size = 40,
}: {
  apiUrl: string;
  name: string;
  photo: string | null;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className="relative inline-flex shrink-0 overflow-hidden rounded-full"
      style={{ width: size, height: size }}
    >
      {photo && !failed ? (
        <img
          src={`${apiUrl}${photo}`}
          alt={name}
          onError={() => setFailed(true)}
          className="h-full w-full bg-[#dfe5e7] object-cover"
        />
      ) : (
        <svg viewBox="0 0 212 212" className="h-full w-full" role="img" aria-label={name}>
          <path
            fill="#DFE5E7"
            d="M106 0C47.5 0 0 47.5 0 106s47.5 106 106 106 106-47.5 106-106S164.5 0 106 0z"
          />
          <path
            fill="#FFF"
            d="M173.6 164.9c-7.5-12.5-19.8-21.4-34-24.7 11.5-9.9 17.1-25 14.8-40-3.4-22.5-24.4-38-47-34.6-22.5 3.4-38 24.4-34.6 47 1.5 9.9 6.5 19 14.2 25.5-14.2 3.3-26.5 12.2-34 24.7 16.9 20.3 41.6 32 68 32.1 26.3-.1 51-11.8 67.6-32z"
          />
        </svg>
      )}
    </span>
  );
}
