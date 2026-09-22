"use client";

import { useEffect, useRef, useState } from "react";
import { MessageCircle, Phone } from "lucide-react";
import { linkify, type MessageToken } from "@repo/types";
import { cn } from "@/lib/utils";

/**
 * A message's text, with the addresses and phone numbers in it made tappable.
 *
 * The message itself is stored as plain text, so this runs at render time and
 * applies to the whole history rather than only to what is sent from now on.
 * Everything is built from React nodes — the text is never handed to the
 * browser as markup — and the only schemes that reach an `href` are the ones
 * `linkify` builds itself.
 */
export function MessageText({ content, className }: { content: string; className?: string }) {
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
            className={cn(
              "font-medium break-all underline underline-offset-2 hover:opacity-80",
              className,
            )}
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
            className={className}
          />
        ),
      )}
    </>
  );
}

/**
 * A number in a message. Tapping it asks what to do with it rather than
 * choosing: on a desktop a `tel:` link often has nothing to open, and WhatsApp
 * is as likely to be what the person wanted anyway.
 */
function PhoneNumber({
  token,
  open,
  onOpen,
  onClose,
  className,
}: {
  token: Extract<MessageToken, { kind: "phone" }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  className?: string;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  // Anchored to the viewport, so a bubble near the top of a scrolling pane
  // cannot clip the menu. Scrolling moves the number out from under it, so it
  // closes instead of drifting.
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
        className={cn(
          "font-medium underline underline-offset-2 hover:opacity-80",
          open && "opacity-80",
          className,
        )}
      >
        {token.text}
      </button>

      {open && at && (
        <>
          {/* Swallows the next click anywhere so the menu closes, the way the
              reaction bar does. */}
          <span className="fixed inset-0 z-40 cursor-default" onClick={onClose} aria-hidden />
          <span
            role="menu"
            aria-label={token.text}
            style={{ left: at.left, top: at.top, width: MENU_WIDTH }}
            className="fixed z-50 flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-lg"
          >
            <span className="truncate border-b px-3 py-2 text-xs text-muted-foreground">
              {token.text}
            </span>
            <MenuLink
              href={token.tel}
              icon={<Phone className="size-4" aria-hidden />}
              onDone={onClose}
            >
              Call
            </MenuLink>
            <MenuLink
              href={token.whatsapp}
              external
              icon={<MessageCircle className="size-4" aria-hidden />}
              onDone={onClose}
            >
              Chat on WhatsApp
            </MenuLink>
          </span>
        </>
      )}
    </>
  );
}

/** Header row plus two options, which is what the menu is positioned against. */
const MENU_HEIGHT = 108;
const MENU_WIDTH = 208;

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
      className="flex items-center gap-2 px-3 py-2 text-sm font-normal text-foreground no-underline transition-colors hover:bg-accent"
    >
      <span className="text-muted-foreground">{icon}</span>
      {children}
    </a>
  );
}
