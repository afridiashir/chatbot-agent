"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Agent, BranchWithAgents, DeactivateAgentResult } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { api, ApiError } from "@/lib/api";

export default function AdminAgentsPage() {
  return <AdminShell>{({ token }) => <Agents token={token} />}</AdminShell>;
}

const EMPTY_FORM = { branchId: "", name: "", email: "", password: "" };

function Agents({ token }: { token: string }) {
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBranches(await api<BranchWithAgents[]>("/api/admin/branches", { token }));
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load agents"));
  }, [refresh]);

  const activeBranches = useMemo(() => branches.filter((b) => b.isActive), [branches]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const create = (event: React.FormEvent) => {
    event.preventDefault();
    void run(async () => {
      const created = await api<Agent>("/api/admin/agents", {
        method: "POST",
        token,
        body: JSON.stringify({ ...form, name: form.name.trim(), email: form.email.trim() }),
      });
      setForm({ ...EMPTY_FORM, branchId: form.branchId });
      setNotice(`${created.name} can now sign in with the password you set.`);
    });
  };

  const toggle = (agent: Agent) =>
    void run(async () => {
      const result = await api<DeactivateAgentResult>(`/api/admin/agents/${agent.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: !agent.isActive }),
      });
      if (!agent.isActive) return;
      const closed = result.closedConversations;
      setNotice(
        closed > 0
          ? `${agent.name} was deactivated and ${closed} open ${
              closed === 1 ? "conversation was" : "conversations were"
            } closed.`
          : `${agent.name} was deactivated.`,
      );
    });

  const move = (agent: Agent, branchId: string) =>
    void run(() =>
      api(`/api/admin/agents/${agent.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ branchId }),
      }),
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add an agent</CardTitle>
          <p className="text-xs text-muted-foreground">
            You set their initial password here. They start offline and choose when to take chats.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-medium">
              Branch
              <select
                required
                value={form.branchId}
                onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                aria-label="Branch"
                className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select a branch</option>
                {activeBranches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium">
              Name
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                aria-label="Agent name"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium">
              Email
              <Input
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                aria-label="Agent email"
              />
            </label>

            <label className="flex flex-col gap-1 text-xs font-medium">
              Initial password
              <Input
                type="password"
                required
                minLength={10}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                aria-label="Initial password"
                placeholder="At least 10 characters"
              />
            </label>

            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>
                Add agent
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {notice && <p className="text-sm text-emerald-700">{notice}</p>}

      {branches.map((branch) => (
        <section key={branch.id}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {branch.name}
            {!branch.isActive && (
              <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                inactive
              </span>
            )}
          </h2>

          <div className="overflow-hidden rounded-lg border">
            {branch.agents.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted-foreground">No agents in this branch.</p>
            ) : (
              branch.agents.map((agent) => (
                <div
                  key={agent.id}
                  data-testid="agent-row"
                  className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar
                      name={agent.name}
                      seed={agent.id}
                      size="md"
                      online={agent.isActive ? agent.isOnline : false}
                    />
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        <span className={agent.isActive ? "" : "text-muted-foreground line-through"}>
                          {agent.name}
                        </span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {agent.email} · {agent.activeConversationCount} active
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={agent.branchId}
                      onChange={(e) => move(agent, e.target.value)}
                      disabled={busy || !agent.isActive}
                      aria-label={`Branch for ${agent.name}`}
                      className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    >
                      {activeBranches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>

                    <Button
                      size="sm"
                      variant={agent.isActive ? "outline" : "default"}
                      onClick={() => toggle(agent)}
                      disabled={busy}
                    >
                      {agent.isActive ? "Deactivate" : "Reactivate"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      ))}

      <p className="text-xs text-muted-foreground">
        Deactivating an agent removes them from routing, forces them offline and closes their open
        conversations. A deactivated agent cannot reply, and leaving visitors waiting on a silent
        chat would be worse than ending it. Their history is kept.
      </p>
    </div>
  );
}
