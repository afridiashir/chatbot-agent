import { Check, CheckCheck } from "lucide-react";
import { receiptStatus, type Message } from "@repo/types";
import { cn } from "@/lib/utils";

/**
 * WhatsApp's ticks on a message the viewer's side sent: one grey tick once
 * stored, two grey once the visitor's widget has it, two blue once they've seen
 * it. The colour isn't the only signal: the label says it too.
 */
export function ReceiptTicks({
  message,
  className,
}: {
  message: Pick<Message, "deliveredAt" | "readAt">;
  className?: string;
}) {
  const status = receiptStatus(message);
  if (status === "SENT") {
    return <Check className={cn("size-3.5 shrink-0", className)} aria-label="Sent" />;
  }
  return (
    <CheckCheck
      className={cn("size-3.5 shrink-0", status === "READ" && "text-chat-read", className)}
      aria-label={status === "READ" ? "Seen" : "Delivered"}
    />
  );
}
