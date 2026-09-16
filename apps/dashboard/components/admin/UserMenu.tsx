"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, KeyRound, LogOut, Monitor, Moon, Sun, UserRound } from "lucide-react";
import type { Admin } from "@repo/types";
import { Avatar } from "@/components/ui/avatar";
import {
  getThemePreference,
  setThemePreference,
  applyTheme,
  type ThemePreference,
} from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEMES: Array<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** The avatar in the top bar and everything about the signed-in account. */
export function UserMenu({ admin, onSignOut }: { admin: Admin; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemePreference>("light");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setTheme(getThemePreference()), []);

  // "System" should follow the OS live, not just at page load.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    // Put focus on the first item so the menu is usable from the keyboard.
    menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function onMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem],[role=menuitemradio]") ?? [],
    );
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    items[(next + items.length) % items.length]?.focus();
  }

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    setThemePreference(value);
  }

  const itemClass =
    "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors hover:bg-accent focus-visible:bg-accent";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1.5 transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:pr-2"
      >
        <Avatar name={admin.name} seed={admin.id} size="sm" />
        <span className="hidden max-w-32 truncate text-sm font-medium lg:block">{admin.name}</span>
        <ChevronDown
          className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Account"
          onKeyDown={onMenuKeyDown}
          className="absolute top-full right-0 z-50 mt-2 w-64 rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg"
        >
          <div className="flex items-center gap-3 px-2.5 py-2">
            <Avatar name={admin.name} seed={admin.id} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{admin.name}</p>
              <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
              <span className="mt-1 inline-block rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {admin.branchId ? `Branch admin · ${admin.branchName}` : "Company admin"}
              </span>
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

          <Link
            href="/admin/profile"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <UserRound className="size-4 text-muted-foreground" aria-hidden />
            Profile
          </Link>
          <Link
            href="/admin/profile#password"
            role="menuitem"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
            Change password
          </Link>

          <div className="my-1 h-px bg-border" />

          <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            Theme
          </p>
          <div role="group" aria-label="Theme" className="grid grid-cols-3 gap-1 px-1.5 pb-1.5">
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                role="menuitemradio"
                aria-checked={theme === value}
                onClick={() => chooseTheme(value)}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] font-medium text-muted-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                  theme === value && "border-foreground/30 bg-accent text-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            className={cn(itemClass, "text-destructive")}
            onClick={() => {
              setOpen(false);
              onSignOut();
            }}
          >
            <LogOut className="size-4" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
