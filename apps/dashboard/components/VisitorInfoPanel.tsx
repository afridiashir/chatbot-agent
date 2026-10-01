"use client";

import { useState } from "react";
import {
  Building2,
  CalendarClock,
  Check,
  Copy,
  Heart,
  MessageCircleOff,
  Phone,
  RotateCcw,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import {
  MARITAL_STATUS_LABELS,
  type ConversationDetail,
  type Label as LabelType,
  type LabelRef,
} from "@repo/types";
import { LabelBar } from "@/components/LabelChip";
import { Avatar } from "@/components/ui/avatar";
import { copyText } from "@/lib/clipboard";
import { formatClock, formatDateSeparator, sinceWhen } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Everything known about the person in the open chat, and what can be done
 * with it — WhatsApp's "contact info". A side panel beside the chat from `md`
 * up, and a screen of its own on a phone, where the header has no room left
 * for the actions this now holds.
 */
export function VisitorInfoPanel({
  detail,
  visitorOnline,
  visitorTyping,
  lastSeenAt,
  labels,
  availableLabels,
  onToggleLabel,
  onShare,
  onCloseConversation,
  closing,
  onReopen,
  reopening,
  onDismiss,
}: {
  detail: ConversationDetail;
  visitorOnline?: boolean;
  visitorTyping: boolean;
  lastSeenAt: string | null;
  labels: LabelRef[];
  availableLabels: LabelType[];
  onToggleLabel: (labelId: string, next: "on" | "off") => void;
  /** Absent where sharing is not offered. */
  onShare?: () => void;
  onCloseConversation: () => void;
  closing: boolean;
  onReopen?: () => void;
  reopening: boolean;
  onDismiss: () => void;
}) {
  const { visitor } = detail;
  const isClosed = detail.status === "CLOSED";
  const title = visitor.displayName || visitor.name;

  return (
    <aside
      aria-label="Contact info"
      className="absolute inset-0 z-20 flex flex-col bg-chat-panel md:static md:w-80 md:shrink-0 md:border-l"
    >
      <header className="flex items-center gap-2 border-b bg-chat-header px-3 py-2.5">
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close contact info"
          className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-full text-chat-meta hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" />
        </button>
        <h2 className="text-sm font-semibold">Contact info</h2>
      </header>

      <div className="flex-1 overflow-y-auto">
        <section className="flex flex-col items-center gap-1 border-b px-4 py-6 text-center">
          <Avatar
            name={visitor.name}
            seed={visitor.id}
            size="lg"
            className="mb-2 h-20 w-20 text-2xl"
          />
          {/* What the team filed them under when there is one, else their own. */}
          <p className="max-w-full truncate text-lg font-semibold">{title}</p>
          <p className="text-xs">
            {visitorTyping ? (
              <span className="font-medium text-success">typing...</span>
            ) : visitorOnline ? (
              <span className="font-medium text-success">Online</span>
            ) : visitorOnline === false && lastSeenAt ? (
              <span className="text-chat-meta">Last seen {sinceWhen(lastSeenAt)}</span>
            ) : visitorOnline === false ? (
              <span className="text-chat-meta">Offline</span>
            ) : null}
          </p>
        </section>

        <dl className="flex flex-col border-b py-1">
          <InfoRow icon={Phone} label="Phone">
            <span className="flex items-center gap-1">
              <a href={`tel:${visitor.phone}`} className="truncate hover:underline">
                {visitor.phone}
              </a>
              <CopyButton value={visitor.phone} label="phone number" />
            </span>
          </InfoRow>
          {visitor.displayName && (
            <InfoRow icon={UserRound} label="Name given">
              {visitor.name}
            </InfoRow>
          )}
          {visitor.city && (
            <InfoRow icon={Building2} label="City">
              {visitor.city}
            </InfoRow>
          )}
          {visitor.maritalStatus && (
            <InfoRow icon={Heart} label="Marital status">
              {MARITAL_STATUS_LABELS[visitor.maritalStatus]}
            </InfoRow>
          )}
          <InfoRow icon={CalendarClock} label="Chat started">
            {formatDateSeparator(detail.createdAt)}, {formatClock(detail.createdAt)}
          </InfoRow>
          {isClosed && detail.closedAt && (
            <InfoRow icon={MessageCircleOff} label="Closed">
              {formatDateSeparator(detail.closedAt)}, {formatClock(detail.closedAt)}
            </InfoRow>
          )}
        </dl>

        <section className="border-b px-4 py-3">
          <h3 className="mb-2 text-xs font-medium text-chat-meta">Labels</h3>
          <LabelBar labels={labels} available={availableLabels} onToggle={onToggleLabel} />
        </section>

        <section className="flex flex-col py-1">
          {!isClosed && onShare && (
            <ActionRow icon={UserRoundPlus} onClick={onShare}>
              Share a colleague
            </ActionRow>
          )}
          {isClosed ? (
            onReopen && (
              <ActionRow icon={RotateCcw} onClick={onReopen} disabled={reopening}>
                {reopening ? "Reopening…" : "Reopen conversation"}
              </ActionRow>
            )
          ) : (
            <ActionRow
              icon={MessageCircleOff}
              onClick={onCloseConversation}
              disabled={closing}
              tone="danger"
            >
              {closing ? "Closing..." : "Close conversation"}
            </ActionRow>
          )}
        </section>
      </div>
    </aside>
  );
}

type IconType = React.ComponentType<{ className?: string }>;

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: IconType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      <Icon className="mt-0.5 size-4 shrink-0 text-chat-meta" aria-hidden />
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] text-chat-meta">{label}</dt>
        <dd className="truncate text-sm">{children}</dd>
      </div>
    </div>
  );
}

function ActionRow({
  icon: Icon,
  onClick,
  disabled,
  tone = "default",
  children,
}: {
  icon: IconType;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60",
        tone === "danger" ? "text-destructive" : "text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </button>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        void copyText(value).then((ok) => {
          if (!ok) return;
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        })
      }
      aria-label={`Copy ${label}`}
      title={copied ? "Copied" : "Copy"}
      className="flex size-6 shrink-0 items-center justify-center rounded text-chat-meta hover:bg-accent hover:text-foreground"
    >
      {copied ? (
        <Check className="size-3.5 text-success" aria-hidden />
      ) : (
        <Copy className="size-3.5" aria-hidden />
      )}
    </button>
  );
}
