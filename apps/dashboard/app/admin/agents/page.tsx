"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleCheck,
  KeyRound,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Search,
  UserPlus,
  Users,
} from "lucide-react";
import type { Agent, AgentWithLoad, BranchWithAgents, DeactivateAgentResult } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Field, PasswordInput, firstFieldErrors, selectClass } from "@/components/admin/form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AdminAgentsPage() {
  return (
    <AdminShell>
      {({ token, admin }) => <Agents token={token} branchName={admin.branchName} />}
    </AdminShell>
  );
}

/** An agent with the branch it belongs to, flattened for the grid. */
interface AgentRow extends AgentWithLoad {
  branchName: string;
  branchActive: boolean;
}

type StatusFilter = "all" | "online" | "offline" | "deactivated";

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "online", label: "Online" },
  { value: "offline", label: "Offline" },
  { value: "deactivated", label: "Deactivated" },
];

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; agent: AgentRow }
  | { kind: "password"; agent: AgentRow }
  | { kind: "deactivate"; agent: AgentRow }
  | null;

function Agents({ token, branchName }: { token: string; branchName: string | null }) {
  const [branches, setBranches] = useState<BranchWithAgents[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const refresh = useCallback(async () => {
    setBranches(await api<BranchWithAgents[]>("/api/admin/branches", { token }));
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load agents"));
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const agents = useMemo<AgentRow[]>(
    () =>
      (branches ?? []).flatMap((branch) =>
        branch.agents.map((agent) => ({
          ...agent,
          branchName: branch.name,
          branchActive: branch.isActive,
        })),
      ),
    [branches],
  );

  const activeBranches = useMemo(() => (branches ?? []).filter((b) => b.isActive), [branches]);

  const counts = useMemo(
    () => ({
      all: agents.length,
      online: agents.filter((a) => a.isActive && a.isOnline).length,
      offline: agents.filter((a) => a.isActive && !a.isOnline).length,
      deactivated: agents.filter((a) => !a.isActive).length,
    }),
    [agents],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return agents.filter((agent) => {
      if (branchFilter && agent.branchId !== branchFilter) return false;
      if (status === "online" && !(agent.isActive && agent.isOnline)) return false;
      if (status === "offline" && !(agent.isActive && !agent.isOnline)) return false;
      if (status === "deactivated" && agent.isActive) return false;
      if (!needle) return true;
      return (
        agent.name.toLowerCase().includes(needle) || agent.email.toLowerCase().includes(needle)
      );
    });
  }, [agents, branchFilter, status, query]);

  async function setActive(agent: AgentRow, isActive: boolean) {
    setBusyId(agent.id);
    setError(null);
    try {
      const result = await api<DeactivateAgentResult>(`/api/admin/agents/${agent.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive }),
      });
      await refresh();
      setDialog(null);
      if (isActive) {
        setNotice(`${agent.name} was reactivated. They start offline until they sign in.`);
      } else {
        const closed = result.closedConversations;
        setNotice(
          closed > 0
            ? `${agent.name} was deactivated and ${closed} open ${
                closed === 1 ? "conversation was" : "conversations were"
              } closed.`
            : `${agent.name} was deactivated.`,
        );
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  const onSaved = async (message: string) => {
    await refresh();
    setDialog(null);
    setError(null);
    setNotice(message);
  };

  const filtered = query.trim() !== "" || branchFilter !== "" || status !== "all";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Agents{branchName && <span className="text-muted-foreground"> · {branchName}</span>}
          </h1>
          <p className="text-sm text-muted-foreground">
            {branches
              ? `${counts.online} online now · ${counts.all - counts.deactivated} active across ${activeBranches.length} branch${activeBranches.length === 1 ? "" : "es"}.`
              : "Loading agents…"}
          </p>
        </div>
        <Button
          onClick={() => setDialog({ kind: "create" })}
          disabled={branches !== null && activeBranches.length === 0}
          title={
            branches !== null && activeBranches.length === 0
              ? "Add an active branch first"
              : undefined
          }
        >
          <Plus className="size-4" aria-hidden />
          Add agent
        </Button>
      </div>

      {/* Filters: one row above everything they scope. */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative lg:w-64">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or email"
            aria-label="Filter agents by name or email"
            className="pl-9"
          />
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          aria-label="Filter by branch"
          hidden={Boolean(branchName)}
          className={cn(selectClass, "lg:w-48")}
        >
          <option value="">All branches</option>
          {(branches ?? []).map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
              {branch.isActive ? "" : " (inactive)"}
            </option>
          ))}
        </select>
        <div
          role="radiogroup"
          aria-label="Filter by status"
          className="flex flex-wrap gap-1 lg:ml-auto"
        >
          {STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={status === option.value}
              onClick={() => setStatus(option.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                status === option.value &&
                  "border-transparent bg-success-soft text-foreground hover:bg-success-soft",
              )}
            >
              {option.label}
              <span className="rounded-full bg-background/70 px-1.5 text-[10px] tabular-nums">
                {counts[option.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex items-center gap-1.5 text-sm text-success">
          <CircleCheck className="size-4 shrink-0" aria-hidden />
          {notice}
        </p>
      )}

      {branches && agents.length === 0 ? (
        <EmptyState
          canAdd={activeBranches.length > 0}
          onAdd={() => setDialog({ kind: "create" })}
        />
      ) : branches && visible.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-10 text-center shadow-sm">
          <p className="text-sm font-medium">No agents match these filters</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => {
              setQuery("");
              setBranchFilter("");
              setStatus("all");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              busy={busyId === agent.id}
              onEdit={() => setDialog({ kind: "edit", agent })}
              onPassword={() => setDialog({ kind: "password", agent })}
              onDeactivate={() => setDialog({ kind: "deactivate", agent })}
              onReactivate={() => void setActive(agent, true)}
            />
          ))}
          {branches && !filtered && activeBranches.length > 0 && (
            <AddTile onAdd={() => setDialog({ kind: "create" })} />
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Deactivating an agent removes them from routing, forces them offline and closes their open
        conversations. A deactivated agent cannot reply, and leaving visitors waiting on a silent
        chat would be worse than ending it. Their history is kept.
      </p>

      <AgentFormDialog
        token={token}
        branches={activeBranches}
        state={dialog?.kind === "create" || dialog?.kind === "edit" ? dialog : null}
        defaultBranchId={branchFilter}
        onClose={() => setDialog(null)}
        onSaved={onSaved}
      />

      <PasswordDialog
        token={token}
        agent={dialog?.kind === "password" ? dialog.agent : null}
        onClose={() => setDialog(null)}
        onSaved={onSaved}
      />

      <Dialog
        open={dialog?.kind === "deactivate"}
        onClose={() => setDialog(null)}
        title={dialog?.kind === "deactivate" ? `Deactivate ${dialog.agent.name}?` : "Deactivate"}
        tone="danger"
        icon={<PowerOff className="size-5" aria-hidden />}
        description={
          dialog?.kind === "deactivate" ? (
            <>
              They will be removed from routing, forced offline and unable to sign in.
              {dialog.agent.activeConversationCount > 0 ? (
                <>
                  {" "}
                  <strong className="font-semibold text-foreground">
                    {dialog.agent.activeConversationCount} open{" "}
                    {dialog.agent.activeConversationCount === 1 ? "conversation" : "conversations"}
                  </strong>{" "}
                  will be closed and the visitors told.
                </>
              ) : (
                " They have no open conversations."
              )}{" "}
              Their history is kept and you can reactivate them later.
            </>
          ) : undefined
        }
      >
        {dialog?.kind === "deactivate" && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === dialog.agent.id}
              onClick={() => void setActive(dialog.agent, false)}
            >
              {busyId === dialog.agent.id ? "Deactivating…" : "Deactivate"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ---------------------------------- cards ---------------------------------- */

function AgentCard({
  agent,
  busy,
  onEdit,
  onPassword,
  onDeactivate,
  onReactivate,
}: {
  agent: AgentRow;
  busy: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const state = !agent.isActive ? "deactivated" : agent.isOnline ? "online" : "offline";

  return (
    <article
      data-testid="agent-card"
      className={cn(
        "flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md",
        !agent.isActive && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <Avatar
          name={agent.name}
          seed={agent.id}
          photo={agent.avatarUrl}
          size="lg"
          online={agent.isActive ? agent.isOnline : undefined}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold">{agent.name}</h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{agent.email}</span>
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            state === "online" && "bg-success-soft text-success",
            state === "offline" && "bg-muted text-muted-foreground",
            state === "deactivated" && "bg-destructive/10 text-destructive",
          )}
        >
          {state === "online" ? "Online" : state === "offline" ? "Offline" : "Deactivated"}
        </span>
      </div>

      <dl className="mx-4 grid grid-cols-2 divide-x rounded-lg bg-muted/60 py-2.5 text-center">
        <div className="flex flex-col items-center gap-0.5 px-2">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Building2 className="size-3" aria-hidden />
            Branch
          </dt>
          <dd className="max-w-full truncate text-sm font-semibold">
            {agent.branchName}
            {!agent.branchActive && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">(inactive)</span>
            )}
          </dd>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-2">
          <dt className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessageCircle className="size-3" aria-hidden />
            Open chats
          </dt>
          <dd className="text-sm font-semibold">{agent.activeConversationCount}</dd>
        </div>
      </dl>

      <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
        Joined{" "}
        {new Date(agent.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-end gap-1 border-t px-2 py-2">
        {agent.isActive ? (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
            <Button variant="ghost" size="sm" onClick={onPassword}>
              <KeyRound className="size-3.5" aria-hidden />
              Password
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onDeactivate}
            >
              <PowerOff className="size-3.5" aria-hidden />
              Deactivate
            </Button>
          </>
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

function AddTile({ onAdd }: { onAdd: () => void }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:bg-success-soft/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-muted">
        <UserPlus className="size-5" aria-hidden />
      </span>
      <span className="text-sm font-medium">Add an agent</span>
    </button>
  );
}

function EmptyState({ canAdd, onAdd }: { canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
      <span className="flex size-14 items-center justify-center rounded-full bg-success-soft text-primary">
        <Users className="size-6" aria-hidden />
      </span>
      <div>
        <h2 className="text-base font-semibold">No agents yet</h2>
        <p className="text-sm text-muted-foreground">
          {canAdd
            ? "Add an agent so visitors have someone to talk to."
            : "Add an active branch first, then add agents to it."}
        </p>
      </div>
      {canAdd && (
        <Button onClick={onAdd}>
          <Plus className="size-4" aria-hidden />
          Add agent
        </Button>
      )}
    </div>
  );
}

/* --------------------------------- dialogs --------------------------------- */

function AgentFormDialog({
  token,
  branches,
  state,
  defaultBranchId,
  onClose,
  onSaved,
}: {
  token: string;
  branches: BranchWithAgents[];
  state: { kind: "create" } | { kind: "edit"; agent: AgentRow } | null;
  defaultBranchId: string;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [branchId, setBranchId] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.kind === "edit") {
      setName(state.agent.name);
      setEmail(state.agent.email);
      setBranchId(state.agent.branchId);
    } else {
      setName("");
      setEmail("");
      // Preselect the branch being filtered on, or the only branch there is.
      const preferred =
        branches.find((b) => b.id === defaultBranchId) ??
        (branches.length === 1 ? branches[0] : undefined);
      setBranchId(preferred?.id ?? "");
    }
    setPassword("");
    setErrors({});
    setFormError(null);
    setSaving(false);
    // Only when the dialog opens, not whenever the branch list refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const editing = state?.kind === "edit";
  const agent = state?.kind === "edit" ? state.agent : null;

  const changes = agent
    ? {
        ...(name.trim() !== agent.name ? { name: name.trim() } : {}),
        ...(email.trim().toLowerCase() !== agent.email ? { email: email.trim() } : {}),
        ...(branchId !== agent.branchId ? { branchId } : {}),
      }
    : null;

  const ready = editing
    ? Object.keys(changes ?? {}).length > 0 && name.trim().length >= 2 && email.trim() !== ""
    : name.trim().length >= 2 && email.trim() !== "" && branchId !== "" && password.length >= 10;

  // An agent can be moved to any active branch, plus the one they are in now
  // even if it has since been deactivated.
  const branchOptions =
    agent && !branches.some((b) => b.id === agent.branchId)
      ? [...branches, { id: agent.branchId, name: `${agent.branchName} (inactive)` }]
      : branches;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!state || !ready) return;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      if (state.kind === "edit") {
        await api(`/api/admin/agents/${state.agent.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(changes),
        });
        const moved = changes?.branchId
          ? ` and moved to ${branches.find((b) => b.id === branchId)?.name ?? "the new branch"}`
          : "";
        await onSaved(`${name.trim()} was updated${moved}.`);
      } else {
        const created = await api<Agent>("/api/admin/agents", {
          method: "POST",
          token,
          body: JSON.stringify({ branchId, name: name.trim(), email: email.trim(), password }),
        });
        await onSaved(`${created.name} was added and can sign in with the password you set.`);
      }
    } catch (err) {
      const fields = firstFieldErrors(err);
      setErrors(fields);
      if (Object.keys(fields).length === 0) {
        const message = err instanceof ApiError ? err.message : "Could not save the agent";
        // The one conflict the server raises is a duplicate email; show it there.
        if (err instanceof ApiError && err.code === "CONFLICT") setErrors({ email: message });
        else setFormError(message);
      }
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={editing ? `Edit ${agent?.name}` : "Add an agent"}
      description={
        editing
          ? "Changing the email changes what they sign in with."
          : "They start offline and choose when to take chats. Share the password with them securely."
      }
      icon={
        editing ? (
          <Pencil className="size-5" aria-hidden />
        ) : (
          <UserPlus className="size-5" aria-hidden />
        )
      }
      className="max-w-lg"
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={errors.name}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Sara Ahmed"
              maxLength={80}
              aria-invalid={Boolean(errors.name)}
            />
          </Field>
          <Field label="Branch" error={errors.branchId}>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              aria-invalid={Boolean(errors.branchId)}
              className={selectClass}
            >
              {!editing && <option value="">Select a branch</option>}
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Email"
          error={errors.email}
          hint={editing ? undefined : "This is what they sign in with."}
        >
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@acme.example"
            autoComplete="off"
            aria-invalid={Boolean(errors.email)}
          />
        </Field>

        {!editing && (
          <Field label="Initial password" error={errors.password}>
            <PasswordInput
              value={password}
              onChange={setPassword}
              invalid={Boolean(errors.password)}
            />
          </Field>
        )}

        {editing && changes?.branchId && agent && agent.activeConversationCount > 0 && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            Their {agent.activeConversationCount} open{" "}
            {agent.activeConversationCount === 1 ? "conversation stays" : "conversations stay"} with
            them after the move.
          </p>
        )}

        {formError && (
          <p role="alert" className="text-xs text-destructive">
            {formError}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !ready}>
            {saving ? "Saving…" : editing ? "Save changes" : "Add agent"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PasswordDialog({
  token,
  agent,
  onClose,
  onSaved,
}: {
  token: string;
  agent: AgentRow | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setPassword("");
    setError(null);
    setSaving(false);
  }, [agent]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!agent || password.length < 10) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/admin/agents/${agent.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ password }),
      });
      await onSaved(`${agent.name}'s password was reset.`);
    } catch (err) {
      setError(
        firstFieldErrors(err).password ??
          (err instanceof ApiError ? err.message : "Could not reset the password"),
      );
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={agent !== null}
      onClose={onClose}
      title={agent ? `Reset ${agent.name}'s password` : "Reset password"}
      description="Set a new password and share it with them securely. Their current sign-in keeps working until it expires."
      icon={<KeyRound className="size-5" aria-hidden />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="New password"
          error={error ?? undefined}
          hint={
            password.length > 0 && password.length < 10
              ? `${10 - password.length} more character${10 - password.length === 1 ? "" : "s"} needed`
              : undefined
          }
        >
          <PasswordInput value={password} onChange={setPassword} invalid={Boolean(error)} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || password.length < 10}>
            {saving ? "Saving…" : "Reset password"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
