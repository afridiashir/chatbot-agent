import { cn } from "@/lib/utils";

/** The shared online/offline indicator used by the inbox header and admin view. */
export function StatusDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        online ? "bg-online" : "bg-muted-foreground/50",
        className,
      )}
    />
  );
}
