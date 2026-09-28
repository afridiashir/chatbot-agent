"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Eye, EyeOff, Pencil } from "lucide-react";
import type { Agent, SocialAccount } from "@repo/types";
import { SocialIcon } from "@/components/admin/SocialIcon";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { copyText } from "@/lib/clipboard";

/**
 * One of an agent's social accounts, opened from its icon on their card.
 *
 * The card only knows the platforms; the login is fetched here, when an admin
 * asks for it, so the credentials are not sitting in every page that lists
 * agents.
 */
export function SocialAccountDetailDialog({
  token,
  agent,
  index,
  onClose,
  onEdit,
}: {
  token: string;
  agent: Pick<Agent, "id" | "name"> | null;
  /** Which account, by its place in the agent's list. */
  index: number;
  onClose: () => void;
  /** Opens the editor for all of this agent's accounts. */
  onEdit: () => void;
}) {
  const [account, setAccount] = useState<SocialAccount | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!agent) return;
    let cancelled = false;
    setAccount(null);
    setError(null);
    setShowPassword(false);
    api<SocialAccount[]>(`/api/admin/agents/${agent.id}/social-accounts`, { token })
      .then((accounts) => {
        if (cancelled) return;
        const found = accounts[index];
        if (found) setAccount(found);
        else setError("This account has been removed.");
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Could not load this account");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agent, index, token]);

  return (
    <Dialog
      open={agent !== null}
      onClose={onClose}
      title={account ? account.platform : "Social account"}
      description={agent ? `${agent.name}'s login. Only admins can see this.` : undefined}
      icon={
        account ? (
          <SocialIcon platform={account.platform} size="lg" className="size-10" />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : !account ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <dl className="flex flex-col gap-3">
            <Credential label="Username" value={account.username} />
            <Credential
              label="Password"
              value={account.password}
              hidden={!showPassword}
              onToggle={() => setShowPassword((shown) => !shown)}
            />
          </dl>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onEdit}>
            <Pencil className="size-3.5" aria-hidden />
            Edit accounts
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** A value with a copy button, and a show/hide one when it is a secret. */
function Credential({
  label,
  value,
  hidden,
  onToggle,
}: {
  label: string;
  value: string;
  hidden?: boolean;
  onToggle?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <div>
      <dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-1 rounded-lg border bg-muted/40 py-1 pr-1 pl-3">
        <span className="min-w-0 flex-1 truncate font-mono text-sm">
          {hidden ? "•".repeat(Math.min(value.length, 12)) : value}
        </span>
        {onToggle && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onToggle}
            aria-label={hidden ? `Show ${label.toLowerCase()}` : `Hide ${label.toLowerCase()}`}
            title={hidden ? "Show" : "Hide"}
          >
            {hidden ? (
              <Eye className="size-4" aria-hidden />
            ) : (
              <EyeOff className="size-4" aria-hidden />
            )}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => void copyText(value).then(setCopied)}
          aria-label={`Copy ${label.toLowerCase()}`}
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? (
            <Check className="size-4 text-success" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
        </Button>
      </dd>
    </div>
  );
}
