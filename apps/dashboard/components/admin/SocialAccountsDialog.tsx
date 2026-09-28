"use client";

import { useEffect, useState } from "react";
import { AtSign, Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import type { Agent, SocialAccount } from "@repo/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SocialIcon, SUGGESTED_PLATFORMS } from "@/components/admin/SocialIcon";
import { api, ApiError } from "@/lib/api";

/** A row being edited; `key` keeps React's inputs attached to the right row. */
interface Draft extends SocialAccount {
  key: number;
}

/**
 * The social media logins the company keeps for an agent. Admin-only: the
 * agent's own session is never sent these, so this dialog is the one place
 * they are read or changed. Saving replaces the whole list.
 */
export function SocialAccountsDialog({
  token,
  agent,
  addNew = false,
  onClose,
  onSaved,
}: {
  token: string;
  agent: Pick<Agent, "id" | "name"> | null;
  /** Opens with a blank row ready to fill in — the card's "+". */
  addNew?: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const [rows, setRows] = useState<Draft[] | null>(null);
  const [shown, setShown] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [nextKey, setNextKey] = useState(0);

  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    setRows(null);
    setShown({});
    setError(null);
    setSaving(false);
    api<SocialAccount[]>(`/api/admin/agents/${agent.id}/social-accounts`, { token })
      .then((accounts) => {
        if (cancelled) return;
        const loaded = accounts.map((account, index) => ({ ...account, key: index }));
        if (addNew) {
          const key = loaded.length;
          loaded.push({ key, platform: "", username: "", password: "" });
          // A password being typed in fresh is easier to get right when visible.
          setShown({ [key]: true });
        }
        setRows(loaded);
        setNextKey(loaded.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "Could not load the accounts");
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [agent, addNew, token]);

  function change(key: number, field: keyof SocialAccount, value: string) {
    setRows((current) =>
      current
        ? current.map((row) => (row.key === key ? { ...row, [field]: value } : row))
        : current,
    );
  }

  function add() {
    setRows((current) => [
      ...(current ?? []),
      { key: nextKey, platform: "", username: "", password: "" },
    ]);
    // A password being typed in fresh is easier to get right when visible.
    setShown((current) => ({ ...current, [nextKey]: true }));
    setNextKey((key) => key + 1);
  }

  function remove(key: number) {
    setRows((current) => (current ? current.filter((row) => row.key !== key) : current));
  }

  // A row left completely blank is an "add" that was not used, not an error.
  const filled = (rows ?? []).filter((row) => row.platform || row.username || row.password);
  const incomplete = filled.some(
    (row) => !row.platform.trim() || !row.username.trim() || !row.password,
  );

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!agent || !rows || incomplete) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/api/admin/agents/${agent.id}/social-accounts`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          accounts: filled.map(({ platform, username, password }) => ({
            platform: platform.trim(),
            username: username.trim(),
            password,
          })),
        }),
      });
      await onSaved(`${agent.name}'s social accounts were saved.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the accounts");
      setSaving(false);
    }
  }

  return (
    <Dialog
      open={agent !== null}
      onClose={onClose}
      title={agent ? `${agent.name}'s social accounts` : "Social accounts"}
      description="Logins the company keeps for this agent. Only admins can see or change them."
      icon={<AtSign className="size-5" aria-hidden />}
      className="max-w-2xl"
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {/* Suggested names match an icon; anything else can still be typed. */}
        <datalist id="social-platforms">
          {SUGGESTED_PLATFORMS.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        {rows === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="rounded-lg bg-muted/60 px-3 py-4 text-center text-sm text-muted-foreground">
            No social accounts yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {rows.map((row) => (
              <div
                key={row.key}
                className="grid grid-cols-1 gap-2 rounded-lg border p-2 sm:grid-cols-[auto_8rem_1fr_1fr_auto] sm:border-0 sm:p-0"
              >
                <SocialIcon platform={row.platform} className="hidden sm:flex" />
                <Input
                  value={row.platform}
                  list="social-platforms"
                  onChange={(e) => change(row.key, "platform", e.target.value)}
                  placeholder="Platform"
                  aria-label="Platform"
                  maxLength={40}
                />
                <Input
                  value={row.username}
                  onChange={(e) => change(row.key, "username", e.target.value)}
                  placeholder="Username"
                  aria-label="Username"
                  autoComplete="off"
                  maxLength={200}
                />
                <div className="relative">
                  <Input
                    type={shown[row.key] ? "text" : "password"}
                    value={row.password}
                    onChange={(e) => change(row.key, "password", e.target.value)}
                    placeholder="Password"
                    aria-label="Password"
                    autoComplete="new-password"
                    maxLength={200}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShown((current) => ({ ...current, [row.key]: !current[row.key] }))
                    }
                    aria-label={shown[row.key] ? "Hide password" : "Show password"}
                    className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    {shown[row.key] ? (
                      <EyeOff className="size-4" aria-hidden />
                    ) : (
                      <Eye className="size-4" aria-hidden />
                    )}
                  </button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(row.key)}
                  aria-label="Remove this account"
                  title="Remove"
                  className="justify-self-end text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </div>
            ))}
          </div>
        )}

        {rows !== null && (
          <Button type="button" variant="outline" size="sm" onClick={add} className="self-start">
            <Plus className="size-3.5" aria-hidden />
            Add account
          </Button>
        )}

        {(error || incomplete) && (
          <p role="alert" className="text-sm text-destructive">
            {error ?? "Each account needs a platform, a username and a password."}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || rows === null || incomplete}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
