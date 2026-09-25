"use client";

/** WhatsApp's six, in its order, then "more" for the full picker. */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/**
 * The little row of emoji that appears above a message. Picking the one
 * already chosen takes it back, which is why the current one is marked.
 */
export function ReactionBar({
  mine,
  onPick,
  onMore,
  onClose,
  onCopy,
}: {
  /** This side's current reaction, so it can be shown as selected. */
  mine: string | null;
  onPick: (emoji: string) => void;
  onMore: () => void;
  onClose: () => void;
  /**
   * Copies the message's text. Absent when there is none to copy, which is
   * what leaves the button off a photo or a voice note.
   */
  onCopy?: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="React to this message"
      // Marks the bar for the outside-click check: without it the closing
      // pointerdown unmounts the button before its click can land.
      data-reaction-bar
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="flex items-center gap-0.5 rounded-full bg-card px-1.5 py-1 border shadow-lg"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(emoji)}
          aria-label={mine === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
          aria-pressed={mine === emoji}
          className={`emoji flex h-8 w-8 items-center justify-center rounded-full text-[22px] leading-none opacity-100 transition hover:scale-110 ${
            mine === emoji ? "bg-accent" : ""
          }`}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onMore}
        aria-label="More emoji"
        className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-chat-meta transition hover:bg-accent"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* The phone's own "copy" is suppressed on this bubble, so it is offered
          here instead. */}
      {onCopy && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onCopy}
          aria-label="Copy text"
          title="Copy"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-chat-meta transition hover:bg-accent"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}
