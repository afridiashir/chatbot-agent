"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Building2, Contact, Loader2, MessagesSquare, Search, Users } from "lucide-react";
import type { AdminSearchResults } from "@repo/types";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";
import { formatListTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Hit {
  key: string;
  href: string;
  group: string;
  title: string;
  subtitle: string;
  leading: React.ReactNode;
}

const GROUPS = [
  { name: "Conversations", icon: MessagesSquare },
  { name: "Leads", icon: Contact },
  { name: "Agents", icon: Users },
  { name: "Branches", icon: Building2 },
] as const;

function toHits(results: AdminSearchResults): Hit[] {
  return [
    ...results.conversations.map((c) => ({
      key: `conversation:${c.id}`,
      href: `/admin/conversations/${c.id}`,
      group: "Conversations",
      title: c.visitorName,
      subtitle: `${c.status === "ACTIVE" ? "Open" : "Closed"} · with ${c.agentName} · ${formatListTime(c.updatedAt)}`,
      leading: <Avatar name={c.visitorName} seed={c.id} size="sm" />,
    })),
    ...results.leads.map((l) => ({
      key: `lead:${l.id}`,
      href: `/admin/leads?${new URLSearchParams({ lead: l.id, search: l.email })}`,
      group: "Leads",
      title: l.name,
      subtitle: `${l.email} · ${l.phone}`,
      leading: <Avatar name={l.name} seed={l.id} size="sm" />,
    })),
    ...results.agents.map((a) => ({
      key: `agent:${a.id}`,
      href: "/admin/agents",
      group: "Agents",
      title: a.name,
      subtitle: `${a.branchName} · ${a.isActive ? (a.isOnline ? "online" : "offline") : "deactivated"}`,
      leading: <Avatar name={a.name} seed={a.id} size="sm" online={a.isActive && a.isOnline} />,
    })),
    ...results.branches.map((b) => ({
      key: `branch:${b.id}`,
      href: "/admin/branches",
      group: "Branches",
      title: b.name,
      subtitle: `${b.agentCount} agent${b.agentCount === 1 ? "" : "s"}${b.isActive ? "" : " · inactive"}`,
      leading: (
        <span className="flex size-8 items-center justify-center rounded-full bg-accent">
          <Building2 className="size-4 text-muted-foreground" aria-hidden />
        </span>
      ),
    })),
  ];
}

/**
 * The top-bar search. Queries every kind of record at once and lets the admin
 * jump straight to it; Ctrl/⌘+K or "/" focuses it from anywhere.
 */
export function GlobalSearch({ token }: { token: string }) {
  const router = useRouter();
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [results, setResults] = useState<AdminSearchResults | null>(null);
  const [active, setActive] = useState(0);
  const [isMac, setIsMac] = useState(false);

  const hits = useMemo(() => (results ? toHits(results) : []), [results]);
  const trimmed = query.trim();

  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent));
  }, []);

  // Keyboard shortcut from anywhere on the page.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;
      if (
        (event.key === "k" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "/" && !typing)
      ) {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close when clicking anywhere else.
  useEffect(() => {
    function onPointer(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  // Debounced, and a newer query aborts the one still in flight.
  useEffect(() => {
    if (trimmed.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(() => {
      api<AdminSearchResults>(`/api/admin/search?${new URLSearchParams({ q: trimmed })}`, {
        token,
        signal: controller.signal,
      })
        .then((next) => {
          setResults(next);
          setError(false);
          setActive(0);
        })
        .catch(() => {
          if (!controller.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, token]);

  function go(hit: Hit) {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(hit.href);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!hits.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % hits.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + hits.length) % hits.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const hit = hits[active];
      if (hit) go(hit);
    }
  }

  const showPanel = open && trimmed.length > 0;
  const activeHit = hits[active];

  return (
    <div ref={wrapperRef} className="relative w-full max-w-lg">
      <Search
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showPanel && activeHit ? `${listId}-${activeHit.key}` : undefined}
        aria-label="Search agents, branches, leads and conversations"
        placeholder="Search anything…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className="h-9 w-full rounded-lg border border-transparent bg-muted pr-16 pl-9 text-sm transition-colors placeholder:text-muted-foreground focus:bg-background focus:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
      />
      <span className="pointer-events-none absolute top-1/2 right-2 hidden -translate-y-1/2 items-center gap-1 sm:flex">
        {loading ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
        ) : (
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-sans text-[10px] font-medium text-muted-foreground">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        )}
      </span>

      {showPanel && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-full right-0 left-0 z-50 mt-2 max-h-[min(70vh,28rem)] overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          {trimmed.length < 2 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Type at least 2 characters
            </p>
          ) : error ? (
            <p className="px-3 py-4 text-center text-xs text-destructive">Search is unavailable</p>
          ) : !results ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              No results for “{trimmed}”
            </p>
          ) : (
            GROUPS.map(({ name, icon: Icon }) => {
              const group = hits.filter((hit) => hit.group === name);
              if (group.length === 0) return null;
              return (
                <div key={name} role="group" aria-label={name} className="py-1">
                  <p className="flex items-center gap-1.5 px-2 pt-1 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <Icon className="size-3.5" aria-hidden />
                    {name}
                  </p>
                  {group.map((hit) => {
                    const index = hits.indexOf(hit);
                    return (
                      <div
                        key={hit.key}
                        id={`${listId}-${hit.key}`}
                        role="option"
                        aria-selected={index === active}
                        onPointerMove={() => setActive(index)}
                        onClick={() => go(hit)}
                        className={cn(
                          "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5",
                          index === active && "bg-accent",
                        )}
                      >
                        {hit.leading}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{hit.title}</p>
                          <p className="truncate text-xs text-muted-foreground">{hit.subtitle}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
