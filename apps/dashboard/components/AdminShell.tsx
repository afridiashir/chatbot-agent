"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import type { Admin } from "@repo/types";
import { Button } from "@/components/ui/button";
import { useAdminSession } from "@/hooks/useAdminSession";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/branches", label: "Branches" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/conversations", label: "Conversations" },
  { href: "/admin/leads", label: "Leads" },
];

/**
 * Guards every admin page and renders the chrome. Children receive the
 * validated session, so no page has to re-check whether it is signed in.
 */
export function AdminShell({
  children,
}: {
  children: (session: { admin: Admin; token: string }) => React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { admin, token, loading, logout } = useAdminSession();

  useEffect(() => {
    if (!loading && !admin) router.replace("/admin/login");
  }, [admin, loading, router]);

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading...</p>;
  }

  if (!admin || !token) {
    return <p className="p-6 text-sm text-muted-foreground">Redirecting to sign in...</p>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold">Admin</span>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active =
                item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent",
                    active && "bg-accent",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{admin.email}</span>
          <Button variant="ghost" size="sm" onClick={logout}>
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6">{children({ admin, token })}</main>
    </div>
  );
}
