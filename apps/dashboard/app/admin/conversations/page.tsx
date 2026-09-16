"use client";

import { AdminInbox } from "@/components/admin/AdminInbox";
import { AdminShell } from "@/components/AdminShell";

export default function AdminConversationsPage() {
  return (
    <AdminShell>
      {({ token }) => <AdminInbox token={token} initialConversationId={null} />}
    </AdminShell>
  );
}
