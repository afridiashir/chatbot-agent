"use client";

import { useCallback, useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  AdminStats,
  BranchWithAgents,
  ClientToServerEvents,
  ServerToClientEvents,
} from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusDot } from "@/components/ui/status-dot";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";

export default function AdminOverviewPage() {
  return <AdminShell>{({ token }) => <Overview token={token} />}</AdminShell>;
}

function Overview({ token }: { token: string }) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextStats, nextBranches] = await Promise.all([
        api<AdminStats>("/api/admin/stats", { token }),
        api<BranchWithAgents[]>("/api/admin/branches", { token }),
      ]);
      setStats(nextStats);
      setBranches(nextBranches);
    } catch {
      setError("Could not load the overview");
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Availability changes anywhere in the company refresh this view live.
  useEffect(() => {
    const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, {
      auth: { role: "ADMIN", token },
      transports: ["websocket", "polling"],
    });
    socket.on("agent:status", () => void refresh());
    return () => {
      socket.close();
    };
  }, [token, refresh]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      {error && <p className="text-sm text-destructive">{error}</p>}

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Stat label="Branches" value={stats.branches.active} hint={`${stats.branches.total} total`} />
          <Stat label="Agents" value={stats.agents.active} hint={`${stats.agents.total} total`} />
          <Stat label="Online now" value={stats.agents.online} hint="available to route" />
          <Stat
            label="Open chats"
            value={stats.conversations.active}
            hint={`${stats.conversations.closed} closed`}
          />
          <Stat
            label="Leads"
            value={stats.leads.total}
            hint={`${stats.leads.missed} never reached an agent`}
          />
        </div>
      )}

      <div className="flex flex-col gap-6">
        {branches.map((branch) => (
          <section key={branch.id}>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              {branch.name}
              {!branch.isActive && (
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  inactive
                </span>
              )}
            </h2>

            <div className="overflow-hidden rounded-lg border">
              {branch.agents.length === 0 ? (
                <p className="px-4 py-3 text-xs text-muted-foreground">No agents yet.</p>
              ) : (
                branch.agents.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between border-b px-4 py-2 last:border-b-0"
                  >
                    <span className="flex items-center gap-2 text-sm">
                      <StatusDot online={agent.isOnline && agent.isActive} />
                      <span className={agent.isActive ? "" : "text-muted-foreground line-through"}>
                        {agent.name}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {!agent.isActive
                        ? "deactivated"
                        : agent.isOnline
                          ? `${agent.activeConversationCount} active`
                          : "offline"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
