"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { AdminConversationDetail } from "@repo/types";
import { AdminShell } from "@/components/AdminShell";
import { Avatar } from "@/components/ui/avatar";
import { api } from "@/lib/api";

export default function AdminConversationPage() {
  const params = useParams<{ conversationId: string }>();
  return (
    <AdminShell>
      {({ token }) => <Transcript token={token} conversationId={params.conversationId} />}
    </AdminShell>
  );
}

function Transcript({ token, conversationId }: { token: string; conversationId: string }) {
  const [detail, setDetail] = useState<AdminConversationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<AdminConversationDetail>(`/api/admin/conversations/${conversationId}`, { token })
      .then(setDetail)
      .catch(() => setError("Could not load that conversation"));
  }, [token, conversationId]);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/admin/conversations"
        className="text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        Back to conversations
      </Link>

      <header className="flex items-center gap-3 rounded-lg border px-4 py-3">
        <Avatar name={detail.visitor.name} seed={detail.visitor.id} size="lg" />
        <div className="min-w-0">
        <p className="text-sm font-medium">
          {detail.agent.name}
          <span className="text-muted-foreground"> · {detail.branch.name}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {detail.visitor.name} · {detail.visitor.email} · {detail.visitor.phone}
        </p>
        <p className="text-xs text-muted-foreground">
          {detail.messages.length} message{detail.messages.length === 1 ? "" : "s"} ·{" "}
          {detail.status === "ACTIVE" ? "open" : "closed"}
        </p>
        </div>
      </header>

      <div className="flex flex-col gap-3">
        {detail.messages.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing was said in this conversation.</p>
        ) : (
          detail.messages.map((message) => {
            const fromAgent = message.senderType === "AGENT";
            return (
              <div
                key={message.id}
                className={fromAgent ? "flex justify-end" : "flex justify-start"}
              >
                <div className="max-w-[75%]">
                  <p className="mb-1 text-[10px] tracking-wide text-muted-foreground uppercase">
                    {fromAgent ? detail.agent.name : detail.visitor.name}
                  </p>
                  <div
                    className={[
                      "rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
                      fromAgent ? "bg-primary text-primary-foreground" : "bg-muted",
                    ].join(" ")}
                  >
                    {message.content}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Read-only. Replying and closing stay with the assigned agent.
      </p>
    </div>
  );
}
