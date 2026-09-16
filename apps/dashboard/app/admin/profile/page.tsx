"use client";

import { useEffect, useState } from "react";
import { CircleCheck, KeyRound, UserRound } from "lucide-react";
import type { Admin } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";

export default function AdminProfilePage() {
  return (
    <AdminShell>
      {({ admin, token, setAdmin }) => <Profile admin={admin} token={token} setAdmin={setAdmin} />}
    </AdminShell>
  );
}

function Profile({
  admin,
  token,
  setAdmin,
}: {
  admin: Admin;
  token: string;
  setAdmin: (admin: Admin) => void;
}) {
  // Honour /admin/profile#password from the account menu once the page exists.
  useEffect(() => {
    if (window.location.hash === "#password") {
      document.getElementById("password")?.scrollIntoView({ block: "start" });
      document.getElementById("current-password")?.focus();
    }
  }, []);

  const memberSince = new Date(admin.createdAt).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Profile</h1>
        <p className="text-sm text-muted-foreground">Your administrator account.</p>
      </div>

      <section className="flex items-center gap-4 rounded-xl border bg-card p-5 shadow-sm">
        <Avatar name={admin.name} seed={admin.id} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{admin.name}</p>
          <p className="truncate text-sm text-muted-foreground">{admin.email}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {admin.branchId ? `Branch admin · ${admin.branchName}` : "Company admin"} · member since{" "}
            {memberSince}
          </p>
        </div>
      </section>

      <DetailsForm admin={admin} token={token} setAdmin={setAdmin} />
      <PasswordForm token={token} />
    </div>
  );
}

function Card({
  id,
  icon: Icon,
  title,
  description,
  children,
}: {
  id?: string;
  icon: typeof UserRound;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-muted-foreground">
          <Icon className="size-4" aria-hidden />
        </span>
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Notice({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "text-xs text-destructive"
          : "flex items-center gap-1.5 text-xs text-[var(--delta-good)]"
      }
    >
      {kind === "ok" && <CircleCheck className="size-3.5" aria-hidden />}
      {children}
    </p>
  );
}

function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || !error.details) return {};
  return Object.fromEntries(
    Object.entries(error.details).map(([key, messages]) => [key, messages[0] ?? ""]),
  );
}

function DetailsForm({
  admin,
  token,
  setAdmin,
}: {
  admin: Admin;
  token: string;
  setAdmin: (admin: Admin) => void;
}) {
  const [name, setName] = useState(admin.name);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const dirty = name.trim() !== admin.name;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const updated = await api<Admin>("/api/admin/auth/me", {
        method: "PATCH",
        token,
        body: JSON.stringify({ name: name.trim() }),
      });
      setAdmin(updated);
      setName(updated.name);
      setNotice({ kind: "ok", text: "Saved" });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          fieldErrors(error).name ?? (error instanceof Error ? error.message : "Could not save"),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card icon={UserRound} title="Details" description="How you appear across the dashboard.">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Name
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium">
          Email
          <Input value={admin.email} readOnly disabled />
          <span className="font-normal text-muted-foreground">
            Your email is your sign-in and cannot be changed here.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      </form>
    </Card>
  );
}

function PasswordForm({ token }: { token: string }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (next !== confirm) {
      setErrors({ confirm: "Passwords do not match" });
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await api("/api/admin/auth/password", {
        method: "POST",
        token,
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      setCurrent("");
      setNext("");
      setConfirm("");
      setNotice({ kind: "ok", text: "Password changed" });
    } catch (error) {
      const fields = fieldErrors(error);
      setErrors(fields);
      if (Object.keys(fields).length === 0) {
        setNotice({
          kind: "error",
          text: error instanceof Error ? error.message : "Could not change password",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      id="password"
      icon={KeyRound}
      title="Password"
      description="Use at least 10 characters. You will stay signed in on this device."
    >
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <PasswordField
          id="current-password"
          label="Current password"
          value={current}
          onChange={setCurrent}
          autoComplete="current-password"
          error={errors.currentPassword}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <PasswordField
            label="New password"
            value={next}
            onChange={setNext}
            autoComplete="new-password"
            error={errors.newPassword}
          />
          <PasswordField
            label="Confirm new password"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            error={errors.confirm}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" disabled={saving || !current || !next || !confirm}>
            {saving ? "Updating…" : "Update password"}
          </Button>
          {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
        </div>
      </form>
    </Card>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  error,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  error?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-medium">
      {label}
      <Input
        id={id}
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        required
      />
      {error && <span className="font-normal text-destructive">{error}</span>}
    </label>
  );
}
