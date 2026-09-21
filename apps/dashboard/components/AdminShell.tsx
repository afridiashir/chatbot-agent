"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Building2,
  Contact,
  LayoutDashboard,
  Menu,
  MessagesSquare,
  ShieldCheck,
  Tag,
  Users,
  X,
} from "lucide-react";
import type { Admin } from "@repo/types";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { UserMenu } from "@/components/admin/UserMenu";
import { Button } from "@/components/ui/button";
import { useAdminSession } from "@/hooks/useAdminSession";
import { cn } from "@/lib/utils";

/** `companyOnly` items are hidden from branch admins, who cannot use them. */
const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/branches", label: "Branches", icon: Building2, companyOnly: true },
  { href: "/admin/agents", label: "Agents", icon: Users },
  { href: "/admin/conversations", label: "Conversations", icon: MessagesSquare },
  { href: "/admin/leads", label: "Leads", icon: Contact },
  { href: "/admin/labels", label: "Labels", icon: Tag, companyOnly: true },
  { href: "/admin/admins", label: "Admins", icon: ShieldCheck, companyOnly: true },
];

export interface AdminPageSession {
  admin: Admin;
  token: string;
  /** Updates the account shown in the top bar after a profile edit. */
  setAdmin: (admin: Admin) => void;
}

/**
 * Guards every admin page and renders the chrome. Children receive the
 * validated session, so no page has to re-check whether it is signed in.
 */
export function AdminShell({
  children,
}: {
  children: (session: AdminPageSession) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, token, loading, logout, setAdmin } = useAdminSession();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!loading && !admin) router.replace("/admin/login");
  }, [admin, loading, router]);

  // Navigating from the mobile drawer should close it.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  }

  if (!admin || !token) {
    return <p className="p-6 text-sm text-muted-foreground">Redirecting to sign in...</p>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Below md the sidebar becomes a drawer over the page. */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r bg-card transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
          <Link href="/admin" className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <MessagesSquare className="size-4" aria-hidden />
            </span>
            Acme Admin
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="size-4" />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
          {admin.branchId && (
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-success-soft/60 px-3 py-2 text-xs">
              <Building2 className="size-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0">
                <span className="block font-semibold">{admin.branchName} branch</span>
                <span className="block text-muted-foreground">Branch admin view</span>
              </span>
            </div>
          )}
          {NAV.filter((item) => !(item.companyOnly && admin.branchId)).map((item) => {
            const active =
              item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                  active && "bg-success-soft text-foreground hover:bg-success-soft",
                )}
              >
                <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-card/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-4 md:px-6">
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 md:hidden"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="size-4" />
          </Button>

          {/* Equal flexible gutters either side keep the search centred. */}
          <div className="hidden flex-1 md:block" />
          <div className="flex min-w-0 flex-[2] justify-center">
            <GlobalSearch token={token} />
          </div>
          <div className="flex shrink-0 justify-end md:flex-1">
            <UserMenu admin={admin} onSignOut={logout} />
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-6">{children({ admin, token, setAdmin })}</main>
      </div>
    </div>
  );
}
