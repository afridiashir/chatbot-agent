import { useEffect, useRef } from "react";
import type { MessageAttachment } from "@repo/types";
import { formatClock } from "../lib/format.js";

export interface ViewedMedia {
  attachment: MessageAttachment;
  sender: string;
  caption: string | null;
  createdAt: string;
}

/**
 * WhatsApp's media viewer: a dark layer over the whole chat with the sender
 * and time on top, the photo or video fitted in the middle and the caption
 * underneath. Closes on the ✕, Escape or a tap on the backdrop.
 */
export function MediaViewer({
  apiUrl,
  media,
  onClose,
}: {
  apiUrl: string;
  media: ViewedMedia;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const src = `${apiUrl}${media.attachment.url}`;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Viewing ${media.attachment.fileName}`}
      className="absolute inset-0 z-20 flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-tight font-medium">{media.sender}</p>
          <p className="truncate text-xs text-white/70">{formatClock(media.createdAt)}</p>
        </div>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          aria-label="Open original in a new tab"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4v11m0 0-4-4m4 4 4-4M5 19h14"
            />
          </svg>
        </a>
      </div>

      <div
        className="flex min-h-0 flex-1 items-center justify-center p-2"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {media.attachment.kind === "VIDEO" ? (
          <video
            src={src}
            controls
            autoPlay
            playsInline
            className="max-h-full max-w-full rounded bg-black"
          />
        ) : (
          <img
            src={src}
            alt={media.attachment.fileName}
            className="max-h-full max-w-full rounded object-contain"
          />
        )}
      </div>

      {media.caption && (
        <p className="max-h-28 overflow-y-auto px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-sm break-words whitespace-pre-wrap text-white/90">
          {media.caption}
        </p>
      )}
    </div>
  );
}
