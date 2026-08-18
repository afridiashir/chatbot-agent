"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AdminConversationSummary, BranchWithAgents, ConversationStatus } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";

export default function AdminConversationsPage() {
  return <AdminShell>{({ token }) => <Conversations token={token} />}</AdminShell>;
}

const STATUSES: Array<{ value: ConversationStatus | ""; label: string }> = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Open" },
  { value: "CLOSED", label: "Closed" },
];

function Conversations({ token }: { token: string }) {
  const [rows, setRows] = useState<AdminConversationSummary[]>([]);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [branchId, setBranchId] = useState("");
  const [status, setStatus] = useState<ConversationStatus | "">("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api<BranchWithAgents[]>("/api/admin/branches", { token })
      .then(setBranches)
      .catch(() => setError("Could not load branches"));
  }, [token]);

  const refresh = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (branchId) params.set("branchId", branchId);
    if (status) params.set("status", status);

    try {
      setRows(
        await api<AdminConversationSummary[]>(`/api/admin/conversations?${params}`, { token }),
      );
      setError(null);
    } catch {
      setError("Could not load conversations");
    } finally {
      setLoading(false);
    }
  }, [token, branchId, status]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Branch
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-label="Filter by branch"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium">
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ConversationStatus | "")}
              aria-label="Filter by status"
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              {STATUSES.map((option) => (
                <option key={option.label} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          {loading ? "Loading..." : `${rows.length} conversation${rows.length === 1 ? "" : "s"}`}
        </p>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="overflow-hidden rounded-lg border">
        {rows.length === 0 && !loading ? (
          <p className="px-4 py-6 text-sm text-muted-foreground">
            No conversations match those filters.
          </p>
        ) : (
          rows.map((row) => (
            <Link
              key={row.id}
              href={`/admin/conversations/${row.id}`}
              className="flex items-center justify-between gap-4 border-b px-4 py-3 transition-colors last:border-b-0 hover:bg-accent"
            >
              <div className="flex min-w-0 items-center gap-3">
                <Avatar name={row.visitor.name} seed={row.visitor.id} size="md" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {row.visitor.name}
                    <span className="text-muted-foreground">
                      {" "}
                      · {row.agent.name} · {row.branch.name}
                    </span>
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {row.lastMessage?.content ?? "No messages"}
                  </p>
                </div>
              </div>

              <span
                className={[
                  "shrink-0 rounded px-2 py-0.5 text-[10px] font-medium",
                  row.status === "ACTIVE"
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-muted text-muted-foreground",
                ].join(" ")}
              >
                {row.status === "ACTIVE" ? "open" : "closed"}
              </span>
            </Link>
          ))
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Admin access to conversations is read-only. Only the assigned agent can reply or close.
      </p>
    </div>
  );
}
