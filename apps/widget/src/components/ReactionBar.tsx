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
}: {
  /** This side's current reaction, so it can be shown as selected. */
  mine: string | null;
  onPick: (emoji: string) => void;
  onMore: () => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="React to this message"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
      className="flex items-center gap-0.5 rounded-full bg-white px-1.5 py-1 shadow-[0_2px_8px_rgb(11_20_26/0.25)]"
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onPick(emoji)}
          aria-label={mine === emoji ? `Remove ${emoji} reaction` : `React with ${emoji}`}
          aria-pressed={mine === emoji}
          className={`emoji flex h-8 w-8 items-center justify-center rounded-full text-[20px] leading-none transition hover:scale-110 ${
            mine === emoji ? "bg-black/10" : ""
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
        className="flex h-8 w-8 items-center justify-center rounded-full bg-black/5 text-wa-icon transition hover:bg-black/10"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
