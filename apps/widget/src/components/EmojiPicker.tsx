import { useEffect, useRef, useState } from "react";
import {
  EMOJI_CATEGORIES,
  searchEmoji,
  type EmojiCategoryId,
  type EmojiEntry,
} from "../lib/emoji.js";
import { getRecentEmoji, storeRecentEmoji } from "../lib/storage.js";

type TabId = "recent" | EmojiCategoryId;

const RECENT_LIMIT = 24;

/** Outline icons for the category tabs, in WhatsApp's order. */
const TAB_ICONS: Record<TabId, React.ReactNode> = {
  recent: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  smileys: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5s1.3 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01" />
    </>
  ),
  animals: (
    <>
      <circle cx="12" cy="13.5" r="6.5" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="6.5" r="2.5" />
      <path d="M10 12.5h.01M14 12.5h.01M11 16h2" />
    </>
  ),
  food: (
    <path d="M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3v3M12 3v3" />
  ),
  activity: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" />
    </>
  ),
  travel: (
    <>
      <path d="M4 16.5V12l2.2-5h11.6l2.2 5v4.5zM4 12h16" />
      <circle cx="8" cy="16.5" r="1.5" />
      <circle cx="16" cy="16.5" r="1.5" />
    </>
  ),
  objects: (
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3z" />
  ),
  symbols: <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
  flags: <path d="M5 21V4h11l-2 4 2 4H5" />,
};

/**
 * WhatsApp's emoji panel: category tabs with a green underline that follows
 * the scroll, a search box, a Recent row and the grid. Emoji buttons don't take
 * focus on mouse down, so on a desktop the caret stays in the message box.
 */
export function EmojiPicker({
  onPick,
  onClose,
}: {
  onPick: (emoji: string) => void;
  onClose: () => void;
}) {
  // Read once per opening: reshuffling "Recent" under the pointer mid-pick
  // would move the emoji the visitor is about to tap again.
  const [recent] = useState(getRecentEmoji);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<TabId>(recent.length > 0 ? "recent" : "smileys");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Escape closes it wherever the focus happens to be: in the message box, in
  // the panel's own search, or nowhere in particular.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const sectionRefs = useRef<Partial<Record<TabId, HTMLElement | null>>>({});

  const sections: { id: TabId; label: string; emoji: EmojiEntry[] }[] = [
    ...(recent.length > 0
      ? [
          {
            id: "recent" as const,
            label: "Recent",
            emoji: recent.map((char) => ({ char, keywords: "" })),
          },
        ]
      : []),
    ...EMOJI_CATEGORIES,
  ];
  const results = query.trim() ? searchEmoji(query) : null;

  function pick(emoji: string) {
    onPick(emoji);
    storeRecentEmoji(
      [emoji, ...getRecentEmoji().filter((e) => e !== emoji)].slice(0, RECENT_LIMIT),
    );
  }

  function jumpTo(id: TabId) {
    setQuery("");
    setActive(id);
    // Wait for the search results to give way to the sections.
    requestAnimationFrame(() => {
      const section = sectionRefs.current[id];
      if (section && scrollRef.current) scrollRef.current.scrollTop = section.offsetTop;
    });
  }

  function onScroll() {
    const top = (scrollRef.current?.scrollTop ?? 0) + 8;
    let current = sections[0]?.id ?? "smileys";
    for (const section of sections) {
      const el = sectionRefs.current[section.id];
      if (el && el.offsetTop <= top) current = section.id;
    }
    setActive(current);
  }

  const grid = (emoji: EmojiEntry[]) => (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((entry) => (
        <button
          key={entry.char}
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => pick(entry.char)}
          aria-label={entry.keywords || entry.char}
          title={entry.keywords.split(" ").slice(0, 3).join(" ")}
          className="emoji flex aspect-square items-center justify-center rounded-md text-[26px] leading-none transition hover:bg-black/5 active:scale-90"
        >
          {entry.char}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className="flex h-64 flex-col border-t border-wa-divider bg-white"
      role="dialog"
      aria-label="Emoji"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="flex border-b border-wa-divider" role="tablist" aria-label="Emoji categories">
        {sections.map(({ id, label }) => {
          const selected = !results && active === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={label}
              title={label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => jumpTo(id)}
              className={`relative flex h-10 flex-1 items-center justify-center transition ${
                selected ? "text-wa-green" : "text-wa-meta hover:text-wa-icon"
              }`}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {TAB_ICONS[id]}
              </svg>
              <span
                className={`absolute inset-x-1.5 bottom-0 h-[3px] rounded-t-full bg-wa-green transition-opacity ${
                  selected ? "opacity-100" : "opacity-0"
                }`}
              />
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1 px-2 pt-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg bg-wa-panel px-3">
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-wa-meta"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="6.5" />
            <path d="m20 20-4.2-4.2" />
          </svg>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search emoji"
            aria-label="Search emoji"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-wa-text placeholder:text-wa-meta focus:outline-none sm:text-sm"
          />
        </label>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          aria-label="Close emoji"
          title="Close"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-wa-icon transition hover:bg-black/5"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div
        ref={scrollRef}
        onScroll={results ? undefined : onScroll}
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2"
      >
        {results ? (
          results.length > 0 ? (
            <div className="pt-2">{grid(results)}</div>
          ) : (
            <p className="py-8 text-center text-sm text-wa-meta">No emoji found</p>
          )
        ) : (
          sections.map((section) => (
            <section
              key={section.id}
              ref={(el) => {
                sectionRefs.current[section.id] = el;
              }}
              aria-label={section.label}
            >
              <h3 className="px-1 pt-2.5 pb-1 text-[13px] text-wa-meta">{section.label}</h3>
              {grid(section.emoji)}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
