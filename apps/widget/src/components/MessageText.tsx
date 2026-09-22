import { useEffect, useRef, useState } from "react";
import { linkify, type MessageToken } from "@repo/types";

/**
 * A message's text, with the addresses and phone numbers in it made tappable.
 *
 * The visitor's half of the same thing the dashboard draws. The detection is
 * shared (`linkify` in @repo/types) so a number that is a link for the agent is
 * a link here too; only the styling is separate, as everywhere else in this
 * widget. Nothing is handed to the browser as markup — these are React nodes,
 * and the only schemes reaching an `href` are the ones `linkify` builds.
 */
export function MessageText({ content }: { content: string }) {
  const [openAt, setOpenAt] = useState<number | null>(null);

  return (
    <>
      {linkify(content).map((token, index) =>
        token.kind === "text" ? (
          <span key={index}>{token.text}</span>
        ) : token.kind === "link" ? (
          <a
            key={index}
            href={token.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium break-all text-inherit underline underline-offset-2 hover:opacity-80"
          >
            {token.text}
          </a>
        ) : (
          <PhoneNumber
            key={index}
            token={token}
            open={openAt === index}
            onOpen={() => setOpenAt(index)}
            onClose={() => setOpenAt(null)}
          />
        ),
      )}
    </>
  );
}

/** Header row plus the two options, which the menu is positioned against. */
const MENU_HEIGHT = 108;
const MENU_WIDTH = 208;

/**
 * A number in a message. Tapping asks what to do with it rather than deciding:
 * on a desktop a `tel:` link often has nothing to open, and WhatsApp is as
 * likely to be what the person wanted.
 */
function PhoneNumber({
  token,
  open,
  onOpen,
  onClose,
}: {
  token: Extract<MessageToken, { kind: "phone" }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  // Anchored to the viewport rather than to the bubble: the panel clips what
  // overflows it, and on a phone the panel is the whole screen. Scrolling takes
  // the number out from under the menu, so it closes rather than drifting.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const above = rect.bottom + MENU_HEIGHT > window.innerHeight;
      setAt({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8)),
        top: above ? rect.top - MENU_HEIGHT - 4 : rect.bottom + 4,
      });
    };
    place();

    const dismiss = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? onClose() : onOpen())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Options for ${token.text}`}
        className={`font-medium text-inherit underline underline-offset-2 hover:opacity-80 ${
          open ? "opacity-80" : ""
        }`}
      >
        {token.text}
      </button>

      {open && at && (
        <>
          {/* Swallows the next click anywhere, so the menu closes. */}
          <span
            className="fixed inset-0 z-[2147483001] cursor-default"
            onClick={onClose}
            aria-hidden
          />
          <span
            role="menu"
            aria-label={token.text}
            style={{ left: at.left, top: at.top, width: MENU_WIDTH }}
            className="fixed z-[2147483002] flex flex-col overflow-hidden rounded-xl bg-white text-left shadow-[0_2px_12px_rgb(11_20_26/0.3)]"
          >
            <span className="truncate border-b border-black/10 px-3 py-2 text-xs text-wa-meta">
              {token.text}
            </span>
            <MenuLink href={token.tel} onDone={onClose} icon={<PhoneIcon />}>
              Call
            </MenuLink>
            <MenuLink href={token.whatsapp} external onDone={onClose} icon={<WhatsAppIcon />}>
              Chat on WhatsApp
            </MenuLink>
          </span>
        </>
      )}
    </>
  );
}

function MenuLink({
  href,
  icon,
  external,
  onDone,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  /** `tel:` hands off to the system, so only the web link opens a tab. */
  external?: boolean;
  onDone: () => void;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      role="menuitem"
      onClick={onDone}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className="flex items-center gap-2 px-3 py-2 text-sm font-normal text-wa-text no-underline transition hover:bg-black/5"
    >
      <span className="text-wa-icon">{icon}</span>
      {children}
    </a>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.24 11.4 11.4 0 0 0 3.6.58 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1 11.4 11.4 0 0 0 .58 3.6 1 1 0 0 1-.25 1z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2m0 1.8a8.2 8.2 0 1 1-4.2 15.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 0 1 12 3.8m-3.7 4c-.2 0-.5.1-.7.4s-.9.9-.9 2.1.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.8 2.2.9 2.6.7 3.1.6.5 0 1.5-.6 1.7-1.2s.2-1.1.2-1.2l-.6-.3-1.6-.8c-.2 0-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-2-1.2 7.4 7.4 0 0 1-1.3-1.7c-.2-.2 0-.4.1-.5l.4-.5.3-.5v-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4z" />
    </svg>
  );
}
