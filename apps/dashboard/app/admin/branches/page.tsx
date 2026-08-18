"use client";

import { useCallback, useEffect, useState } from "react";
import type { Branch, BranchWithAgents } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

export default function AdminBranchesPage() {
  return <AdminShell>{({ token }) => <Branches token={token} />}</AdminShell>;
}

function Branches({ token }: { token: string }) {
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const refresh = useCallback(async () => {
    setBranches(await api<BranchWithAgents[]>("/api/admin/branches", { token }));
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load branches"));
  }, [refresh]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
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
    const trimmed = name.trim();
    if (!trimmed) return;
    void run(async () => {
      await api<Branch>("/api/admin/branches", {
        method: "POST",
        token,
        body: JSON.stringify({ name: trimmed }),
      });
      setName("");
    });
  };

  const rename = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    void run(async () => {
      await api<Branch>(`/api/admin/branches/${editing.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ name: editing.name.trim() }),
      });
      setEditing(null);
    });
  };

  const toggle = (branch: BranchWithAgents) =>
    void run(() =>
      api<Branch>(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive: !branch.isActive }),
      }),
    );

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a branch</CardTitle>
          <p className="text-xs text-muted-foreground">
            New branches are offered to visitors immediately, but nobody is routed there until an
            agent in that branch comes online.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="flex items-center gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Branch name"
              aria-label="Branch name"
              required
            />
            <Button type="submit" disabled={busy}>
              Add branch
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border">
        {branches.map((branch) => (
          <div
            key={branch.id}
            data-testid="branch-row"
            className="flex items-center justify-between gap-3 border-b px-4 py-3 last:border-b-0"
          >
            {editing?.id === branch.id ? (
              <form onSubmit={rename} className="flex flex-1 items-center gap-2">
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ id: branch.id, name: e.target.value })}
                  aria-label="New branch name"
                  autoFocus
                />
                <Button type="submit" size="sm" disabled={busy}>
                  Save
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </form>
            ) : (
              <>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {branch.name}
                    {!branch.isActive && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        inactive
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {branch.agents.filter((a) => a.isActive).length} agents
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing({ id: branch.id, name: branch.name })}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant={branch.isActive ? "outline" : "default"}
                    onClick={() => toggle(branch)}
                    disabled={busy}
                  >
                    {branch.isActive ? "Deactivate" : "Reactivate"}
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        Deactivating hides a branch from the chat widget and stops new chats being routed there.
        Existing conversations continue so nobody is cut off mid-chat, and the branch can be
        reactivated at any time.
      </p>
    </div>
  );
}
