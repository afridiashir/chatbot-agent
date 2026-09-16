"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  CircleCheck,
  Globe,
  KeyRound,
  Lock,
  Mail,
  Pencil,
  Plus,
  Power,
  PowerOff,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import type { Admin, BranchWithAgents } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Field, PasswordInput, firstFieldErrors, selectClass } from "@/components/admin/form";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function AdminAdminsPage() {
  return (
    <AdminShell>
      {({ admin, token }) =>
        admin.branchId ? <CompanyOnly /> : <Admins token={token} me={admin} />
      }
    </AdminShell>
  );
}

/** A branch admin who follows a link here sees why, not an error. */
function CompanyOnly() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-xl border bg-card px-6 py-14 text-center shadow-sm">
      <span className="flex size-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-6" aria-hidden />
      </span>
      <h1 className="text-base font-semibold">Company admins only</h1>
      <p className="text-sm text-muted-foreground">
        Admin accounts are managed by your company admin.
      </p>
      <Link
        href="/admin"
        className="inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent"
      >
        Back to overview
      </Link>
    </div>
  );
}

/** "" means company admin (all branches) in the scope select. */
const COMPANY_SCOPE = "";

type DialogState =
  | { kind: "create" }
  | { kind: "edit"; admin: Admin }
  | { kind: "password"; admin: Admin }
  | { kind: "deactivate"; admin: Admin }
  | null;

type ScopeFilter = "all" | "company" | "branch" | "deactivated";

function Admins({ token, me }: { token: string; me: Admin }) {
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [branches, setBranches] = useState<BranchWithAgents[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScopeFilter>("all");

  const refresh = useCallback(async () => {
    const [nextAdmins, nextBranches] = await Promise.all([
      api<Admin[]>("/api/admin/admins", { token }),
      api<BranchWithAgents[]>("/api/admin/branches", { token }),
    ]);
    setAdmins(nextAdmins);
    setBranches(nextBranches);
  }, [token]);

  useEffect(() => {
    void refresh().catch(() => setError("Could not load admins"));
  }, [refresh]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const list = admins ?? [];
  const counts = {
    all: list.length,
    company: list.filter((a) => a.isActive && !a.branchId).length,
    branch: list.filter((a) => a.isActive && a.branchId).length,
    deactivated: list.filter((a) => !a.isActive).length,
  };
  const visible = list.filter((a) =>
    filter === "company"
      ? a.isActive && !a.branchId
      : filter === "branch"
        ? a.isActive && a.branchId
        : filter === "deactivated"
          ? !a.isActive
          : true,
  );

  // Branches with nobody looking after them, so the gap is visible.
  const uncovered = branches.filter(
    (b) => b.isActive && !list.some((a) => a.isActive && a.branchId === b.id),
  );

  async function setActive(target: Admin, isActive: boolean) {
    setBusyId(target.id);
    setError(null);
    try {
      await api(`/api/admin/admins/${target.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ isActive }),
      });
      await refresh();
      setDialog(null);
      setNotice(
        isActive
          ? `${target.name} was reactivated and can sign in again.`
          : `${target.name} was deactivated and signed out everywhere.`,
      );
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

  const filters: Array<{ value: ScopeFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "company", label: "Company admins" },
    { value: "branch", label: "Branch admins" },
    { value: "deactivated", label: "Deactivated" },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Admins</h1>
          <p className="text-sm text-muted-foreground">
            Company admins see every branch. Branch admins see and manage only their own branch.
          </p>
        </div>
        <Button onClick={() => setDialog({ kind: "create" })}>
          <Plus className="size-4" aria-hidden />
          Add admin
        </Button>
      </div>

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-sm sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label="Filter admins" className="flex flex-wrap gap-1">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                filter === option.value &&
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
        {admins && uncovered.length > 0 && (
          <p className="flex items-center gap-1.5 text-xs text-warning sm:ml-auto">
            <Building2 className="size-3.5" aria-hidden />
            No branch admin yet: {uncovered.map((b) => b.name).join(", ")}
          </p>
        )}
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

      {!admins ? (
        <p className="text-sm text-muted-foreground">Loading admins…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border bg-card px-6 py-10 text-center text-sm text-muted-foreground shadow-sm">
          No admins in this view.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((admin) => (
            <AdminCard
              key={admin.id}
              admin={admin}
              isMe={admin.id === me.id}
              busy={busyId === admin.id}
              onEdit={() => setDialog({ kind: "edit", admin })}
              onPassword={() => setDialog({ kind: "password", admin })}
              onDeactivate={() => setDialog({ kind: "deactivate", admin })}
              onReactivate={() => void setActive(admin, true)}
            />
          ))}
          {filter === "all" && (
            <button
              type="button"
              onClick={() => setDialog({ kind: "create" })}
              className="flex min-h-52 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input text-muted-foreground transition-colors hover:border-primary hover:bg-success-soft/40 hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex size-11 items-center justify-center rounded-full bg-muted">
                <UserPlus className="size-5" aria-hidden />
              </span>
              <span className="text-sm font-medium">Add an admin</span>
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Deactivating an admin signs them out immediately, on every device. You cannot deactivate or
        change the access of your own account, and a company always keeps at least one active
        company admin.
      </p>

      <AdminFormDialog
        token={token}
        branches={branches}
        me={me}
        state={dialog?.kind === "create" || dialog?.kind === "edit" ? dialog : null}
        onClose={() => setDialog(null)}
        onSaved={onSaved}
      />

      <PasswordDialog
        token={token}
        admin={dialog?.kind === "password" ? dialog.admin : null}
        onClose={() => setDialog(null)}
        onSaved={onSaved}
      />

      <Dialog
        open={dialog?.kind === "deactivate"}
        onClose={() => setDialog(null)}
        tone="danger"
        icon={<PowerOff className="size-5" aria-hidden />}
        title={dialog?.kind === "deactivate" ? `Deactivate ${dialog.admin.name}?` : "Deactivate"}
        description="They are signed out at once and cannot sign in again until reactivated. Nothing they did is deleted."
      >
        {dialog?.kind === "deactivate" && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busyId === dialog.admin.id}
              onClick={() => void setActive(dialog.admin, false)}
            >
              {busyId === dialog.admin.id ? "Deactivating…" : "Deactivate"}
            </Button>
          </div>
        )}
      </Dialog>
    </div>
  );
}

/* ---------------------------------- card ----------------------------------- */

function AdminCard({
  admin,
  isMe,
  busy,
  onEdit,
  onPassword,
  onDeactivate,
  onReactivate,
}: {
  admin: Admin;
  isMe: boolean;
  busy: boolean;
  onEdit: () => void;
  onPassword: () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const company = admin.branchId === null;
  return (
    <article
      data-testid="admin-card"
      className={cn(
        "flex flex-col rounded-xl border bg-card shadow-sm transition-shadow hover:shadow-md",
        !admin.isActive && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3 p-4">
        <Avatar name={admin.name} seed={admin.id} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 truncate text-base font-semibold">
            <span className="truncate">{admin.name}</span>
            {isMe && (
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                You
              </span>
            )}
          </h2>
          <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
            <Mail className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{admin.email}</span>
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium",
            admin.isActive ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          {admin.isActive ? "Active" : "Deactivated"}
        </span>
      </div>

      <div className="mx-4 flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            company ? "bg-primary text-primary-foreground" : "bg-success-soft text-primary",
          )}
        >
          {company ? (
            <Globe className="size-4" aria-hidden />
          ) : (
            <Building2 className="size-4" aria-hidden />
          )}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">{company ? "Company admin" : "Branch admin"}</p>
          <p className="truncate text-xs text-muted-foreground">
            {company
              ? "All branches, admins and settings"
              : `${admin.branchName ?? "Unknown"} branch only`}
          </p>
        </div>
      </div>

      <p className="px-4 pt-3 pb-1 text-xs text-muted-foreground">
        Added{" "}
        {new Date(admin.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </p>

      <div className="mt-auto flex flex-wrap items-center justify-end gap-1 border-t px-2 py-2">
        {admin.isActive ? (
          <>
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="size-3.5" aria-hidden />
              Edit
            </Button>
            {isMe ? (
              <Link
                href="/admin/profile#password"
                className="inline-flex h-8 items-center gap-2 rounded-md px-3 text-xs font-medium transition-colors hover:bg-accent"
              >
                <KeyRound className="size-3.5" aria-hidden />
                Password
              </Link>
            ) : (
              <>
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
            )}
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

/* --------------------------------- dialogs --------------------------------- */

function AdminFormDialog({
  token,
  branches,
  me,
  state,
  onClose,
  onSaved,
}: {
  token: string;
  branches: BranchWithAgents[];
  me: Admin;
  state: { kind: "create" } | { kind: "edit"; admin: Admin } | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [scope, setScope] = useState(COMPANY_SCOPE);
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!state) return;
    if (state.kind === "edit") {
      setName(state.admin.name);
      setEmail(state.admin.email);
      setScope(state.admin.branchId ?? COMPANY_SCOPE);
    } else {
      setName("");
      setEmail("");
      // New admins are most often for a branch; start there when one exists.
      setScope(branches.find((b) => b.isActive)?.id ?? COMPANY_SCOPE);
    }
    setPassword("");
    setErrors({});
    setFormError(null);
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const editing = state?.kind === "edit";
  const target = state?.kind === "edit" ? state.admin : null;
  const isMe = target?.id === me.id;
  const branchId = scope === COMPANY_SCOPE ? null : scope;

  const changes = useMemo(
    () =>
      target
        ? {
            ...(name.trim() !== target.name ? { name: name.trim() } : {}),
            ...(email.trim().toLowerCase() !== target.email ? { email: email.trim() } : {}),
            ...(branchId !== target.branchId ? { branchId } : {}),
          }
        : null,
    [target, name, email, branchId],
  );

  const ready = editing
    ? Object.keys(changes ?? {}).length > 0 && name.trim().length >= 2 && email.trim() !== ""
    : name.trim().length >= 2 && email.trim() !== "" && password.length >= 10;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!state || !ready) return;
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      if (state.kind === "edit") {
        await api(`/api/admin/admins/${state.admin.id}`, {
          method: "PATCH",
          token,
          body: JSON.stringify(changes),
        });
        await onSaved(`${name.trim()} was updated.`);
      } else {
        const created = await api<Admin>("/api/admin/admins", {
          method: "POST",
          token,
          body: JSON.stringify({ name: name.trim(), email: email.trim(), password, branchId }),
        });
        await onSaved(
          `${created.name} was added as ${
            created.branchId ? `the ${created.branchName} branch admin` : "a company admin"
          } and can sign in with the password you set.`,
        );
      }
    } catch (err) {
      const fields = firstFieldErrors(err);
      setErrors(fields);
      if (Object.keys(fields).length === 0) {
        const message = err instanceof ApiError ? err.message : "Could not save the admin";
        if (err instanceof ApiError && message.includes("email")) setErrors({ email: message });
        else setFormError(message);
      }
      setSaving(false);
    }
  }

  const scopeChanged = target && branchId !== target.branchId;

  return (
    <Dialog
      open={state !== null}
      onClose={onClose}
      title={editing ? `Edit ${target?.name}` : "Add an admin"}
      description={
        editing
          ? "Changing access takes effect on their next click, without signing them out."
          : "Share the password with them securely. They can change it from their profile."
      }
      icon={
        editing ? (
          <Pencil className="size-5" aria-hidden />
        ) : (
          <ShieldCheck className="size-5" aria-hidden />
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
          <Field label="Email" error={errors.email}>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@acme.example"
              autoComplete="off"
              aria-invalid={Boolean(errors.email)}
            />
          </Field>
        </div>

        <Field
          label="Access"
          error={errors.branchId}
          hint={
            isMe
              ? "You cannot change your own access."
              : branchId
                ? "Sees this branch's overview, conversations and leads, and manages its agents."
                : "Sees every branch and manages branches, agents and admins."
          }
        >
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            disabled={isMe}
            className={selectClass}
          >
            <option value={COMPANY_SCOPE}>Company admin — all branches</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                Branch admin — {branch.name}
                {branch.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </select>
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

        {scopeChanged && (
          <p className="rounded-lg bg-warning-soft px-3 py-2 text-xs text-warning">
            {branchId
              ? "They will lose access to every other branch and to branch and admin settings."
              : "They will gain access to every branch, and to branch and admin settings."}
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
            {saving ? "Saving…" : editing ? "Save changes" : "Add admin"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

function PasswordDialog({
  token,
  admin,
  onClose,
  onSaved,
}: {
  token: string;
  admin: Admin | null;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!admin) return;
    setPassword("");
    setError(null);
    setSaving(false);
  }, [admin]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!admin || password.length < 10) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/admin/admins/${admin.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ password }),
      });
      await onSaved(`${admin.name}'s password was reset.`);
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
      open={admin !== null}
      onClose={onClose}
      title={admin ? `Reset ${admin.name}'s password` : "Reset password"}
      description="Set a new password and share it with them securely."
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
