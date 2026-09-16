"use client";

import { useParams } from "next/navigation";
import { AdminInbox } from "@/components/admin/AdminInbox";
import { AdminShell } from "@/components/AdminShell";

/** A deep link to one conversation opens the same two-pane view with it selected. */
export default function AdminConversationPage() {
  const params = useParams<{ conversationId: string }>();
  return (
    <AdminShell>
      {({ token }) => <AdminInbox token={token} initialConversationId={params.conversationId} />}
    </AdminShell>
  );
}
