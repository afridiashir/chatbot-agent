"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleCheck,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Users,
  Wifi,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import type { Admin, Branch, BranchWithAgents } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AdminBranchesPage() {
  return (
    <AdminShell>
      {({ token, admin }) => (admin.branchId ? <CompanyOnlyNotice /> : <Branches token={token} />)}
    </AdminShell>
  );
}

/** Branch admins cannot manage branches; the nav hides this page, a link explains why. */
function CompanyOnlyNotice() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Building2 className="size-6" aria-hidden />
      </span>
      <h1 className="text-base font-semibold">Company admins only</h1>
      <p className="text-sm text-muted-foreground">
        Branches are added and renamed by your company admin. Your branch&apos;s overview, agents,
        conversations and leads are in the menu.
      </p>
    </div>
  );
}

/** Which dialog is open, and for which branch. */
type DialogState =
  | { kind: "create" }
  | { kind: "rename"; branch: BranchWithAgents }
  | { kind: "deactivate"; branch: BranchWithAgents }
  | null;

function Branches({ token }: { token: string }) {
  const [branches, setBranches] = useState<BranchWithAgents[] | null>(null);
  const [admins, setAdmins] = useState<Admin[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [nextBranches, nextAdmins] = await Promise.all([
      api<BranchWithAgents[]>("/api/admin/branches", { token }),
      api<Admin[]>("/api/admin/admins", { token }),
    ]);
    setBranches(nextBranches);
    setAdmins(nextAdmins);
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load branches"));
  }, [refresh]);

  // Success messages clear themselves; errors stay until the next action.
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  async function setActive(branch: BranchWithAgents, isActive: boolean) {
    setTogglingId(branch.id);
    setError(null);
    try {
      await api<Branch>(`/api/admin/branches/${branch.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive }),
      });
      await refresh();
      setNotice(`${branch.name} ${isActive ? "reactivated" : "deactivated"}`);
      setDialog(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setTogglingId(null);
    }
  }

  const counts = useMemo(() => {
    const list = branches ?? [];
    return { active: list.filter((b) => b.isActive).length, total: list.length };
  }, [branches]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Branches</h1>
          <p className="text-sm text-muted-foreground">
            {branches
              ? `${counts.active} active of ${counts.total}. Visitors choose one of the active branches before chatting.`
              : "Loading branches…"}
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-4" aria-hidden />
          Add branch
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4" aria-hidden />
          {notice}
        </p>
      )}

      {branches && branches.length === 0 ? (
        <EmptyState onAdd={() => setDialog({ kind: "create" })} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {(branches ?? []).map((branch) => (
            <BranchCard
              key={branch.id}
              branch={branch}
              busy={togglingId === branch.id}
              admins={admins.filter((a) => a.isActive && a.branchId === branch.id)}
              onRename={() => setDialog({ kind: "rename", branch })}
              onDeactivate={() => setDialog({ kind: "deactivate", branch })}
              onReactivate={() => void setActive(branch, true)}
            />
          ))}
          {branches && <AddTile onAdd={() => setDialog({ kind: "create" })} />}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Deactivating hides a branch from the chat widget and stops new chats being routed there.
        Existing conversations continue so nobody is cut off mid-chat, and the branch can be
        reactivated at any time.
      </p>

      <BranchNameDialog
        token={token}
        state={dialog?.kind === "create" || dialog?.kind === "rename" ? dialog : null}
        onClose={() => setDialog(null)}
        onSaved={async (message) => {
          await refresh();
          setDialog(null);
          setError(null);
          setNotice(message);
        }}
      />

      <Dialog
        open={dialog?.kind === "deactivate"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "deactivate" ? `Deactivate ${dialog.branch.name}?` : "Deactivate"}
        description="Visitors will no longer see this branch, and no new chats will be routed to it. Open conversations carry on, and you can reactivate it at any time."
        icon={<PowerOff className="size-5" aria-hidden />}
        tone="danger"
      >
        {dialog?.kind === "deactivate" && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={togglingId === dialog.branch.id}
              onClick={() => void setActive(dialog.branch, false)}
            >
              {togglingId === dialog.branch.id ? "Deactivating…" : "Deactivate"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ---------------------------------- cards ---------------------------------- */

function BranchCard({
  branch,
  busy,
  admins,
  onRename,
  onDeactivate,
  onReactivate,
}: {
  branch: BranchWithAgents;
  busy: boolean;
  /** Active branch admins of this branch. */
  admins: Admin[];
  onRename: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const active = branch.agents.filter((a) => a.isActive);
  const online = active.filter((a) => a.isOnline);
  const openChats = active.reduce((sum, a) => sum + a.activeConversationCount, 0);
  const shown = active.slice(0, 5);

  return (
    <article
      data-testid="branch-card"
      className={cn(
        "flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md",
        !branch.isActive && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-full",
            branch.isActive ? "bg-success-soft text-primary" : "bg-muted text-muted-foreground",
          )}
        >
          <Building2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{branch.name}</h2>
          <p className="text-xs text-muted-foreground">
            Added{" "}
            {new Date(branch.createdAt).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            branch.isActive ? "bg-success-soft text-success" : "bg-muted text-muted-foreground",
          )}
        >
          {branch.isActive ? "Active" : "Inactive"}
        </span>
      </div>

      <dl className="mx-4 grid grid-cols-3 divide-x rounded-lg bg-muted/60 py-2.5 text-center">
        <Stat icon={Users} label="Agents" value={active.length} />
        <Stat icon={Wifi} label="Online" value={online.length} />
        <Stat icon={MessageCircle} label="Open chats" value={openChats} />
      </dl>

      <div className="mx-4 mt-3 flex items-center gap-2 text-xs">
        <ShieldCheck className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        {admins.length > 0 ? (
          <span className="truncate">
            <span className="text-muted-foreground">Branch admin: </span>
            <span className="font-medium">{admins.map((a) => a.name).join(", ")}</span>
          </span>
        ) : (
          <Link href="/admin/admins" className="font-medium text-warning hover:underline">
            No branch admin — assign one
          </Link>
        )}
      </div>

      <div className="flex min-h-12 items-center gap-2 px-4 py-3">
        {shown.length === 0 ? (
          <p className="text-xs text-muted-foreground">No agents yet. Add one from Agents.</p>
        ) : (
          <>
            <div className="flex -space-x-2">
              {shown.map((agent) => (
                <span
                  key={agent.id}
                  title={`${agent.name} · ${agent.isOnline ? "online" : "offline"}`}
                >
                  <Avatar
                    name={agent.name}
                    seed={agent.id}
                    photo={agent.avatarUrl}
                    size="sm"
                    online={agent.isOnline}
                    className="rounded-full ring-2 ring-card"
                  />
                </span>
              ))}
            </div>
            {active.length > shown.length && (
              <span className="text-xs text-muted-foreground">
                +{active.length - shown.length} more
              </span>
            )}
          </>
        )}
      </div>

      <div className="mt-auto flex items-center justify-end gap-1 border-t px-2 py-2">
        <Button variant="ghost" size="sm" onClick={onRename}>
          <Pencil className="size-3.5" aria-hidden />
          Rename
        </Button>
        {branch.isActive ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDeactivate}
          >
            <PowerOff className="size-3.5" aria-hidden />
            Deactivate
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="text-success"
            onClick={onReactivate}
            disabled={busy}
          >
            <Power className="size-3.5" aria-hidden />
            {busy ? "Reactivating…" : "Reactivate"}
          </Button>
        )}
      </div>
    </article>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-2">
      <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
        <Icon className="size-3" aria-hidden />
        {label}
      </dt>
      <dd className="text-lg font-semibold">{value}</dd>
    </div>
  );
}

function AddTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:bg-success-soft/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <Plus className="size-5" aria-hidden />
      </span>
      <span className="text-sm font-medium">Add a branch</span>
    </button>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
      <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-primary">
        <Building2 className="size-6" aria-hidden />
      </span>
      <div>
        <h2 className="text-base font-semibold">No branches yet</h2>
        <p className="text-sm text-muted-foreground">
          Add your first branch so visitors have somewhere to be routed.
        </p>
      </div>
      <Button onClick={onAdd}>
        <Plus className="size-4" aria-hidden />
        Add branch
      </Button>
    </div>
  );
}

/* ---------------------------------- dialog --------------------------------- */

function BranchNameDialog({
  token,
  state,
  onClose,
  onSaved,
}: {
  token: string;
  state: { kind: "create" } | { kind: "rename"; branch: BranchWithAgents } | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Reset the form each time the dialog opens, prefilled when renaming.
  useEffect(() => {
    if (!state) return;
    setName(state.kind === "rename" ? state.branch.name : "");
    setError(null);
    setSaving(false);
  }, [state]);

  const renaming = state?.kind === "rename";
  const trimmed = name.trim();
  const unchanged = renaming && trimmed === state.branch.name;
  const tooShort = trimmed.length > 0 && trimmed.length < 2;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!state || trimmed.length < 2 || unchanged) return;
    setSaving(true);
    setError(null);
    try {
      if (state.kind === "rename") {
        await api<Branch>(`/api/admin/branches/${state.branch.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify({ name: trimmed }),
        });
        await onSaved(`Renamed to ${trimmed}`);
      } else {
        await api<Branch>("/api/admin/branches", {
          method: "POST",
          token,
          body: JSON.stringify({ name: trimmed }),
        });
        await onSaved(`${trimmed} added`);
      }
    } catch (err) {
      const field = err instanceof ApiError ? err.details?.name?.[0] : undefined;
      setError(field ?? (err instanceof ApiError ? err.message : "Could not save the branch"));
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={renaming ? "Rename branch" : "Add a branch"}
      description={
        renaming
          ? "Visitors see the new name in the chat widget straight away."
          : "It is offered to visitors immediately, but chats are only routed there once one of its agents is online."
      }
      icon={
        renaming ? (
          <Pencil className="size-5" aria-hidden />
        ) : (
          <Building2 className="size-5" aria-hidden />
        )
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Branch name
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="e.g. Lahore"
            maxLength={80}
            autoFocus
            aria-invalid={Boolean(error || tooShort)}
            aria-describedby="branch-name-hint"
          />
          <span
            id="branch-name-hint"
            className={cn(
              "font-normal",
              error || tooShort ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {error ??
              (tooShort ? "Use at least 2 characters" : "Must be unique within your company.")}
          </span>
        </label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || trimmed.length < 2 || unchanged}>
            {saving ? "Saving…" : renaming ? "Save name" : "Add branch"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
