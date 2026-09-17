interface LauncherProps {
  isOpen: boolean;
  onToggle: () => void;
}

/** WhatsApp's green round button. */
export function Launcher({ isOpen, onToggle }: LauncherProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isOpen ? "Close chat" : "Open chat"}
      aria-expanded={isOpen}
      className="flex h-14 w-14 items-center justify-center rounded-full bg-wa-launcher text-white shadow-[0_4px_12px_rgb(0_0_0/0.25)] transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-wa-teal focus-visible:ring-offset-2"
    >
      {isOpen ? (
        <svg
          viewBox="0 0 24 24"
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor" aria-hidden="true">
          <path d="M12 2C6.5 2 2 6.2 2 11.4c0 2 .7 3.9 1.9 5.4L2.6 21.3a.5.5 0 0 0 .6.6l4.7-1.3c1.2.5 2.6.8 4.1.8 5.5 0 10-4.2 10-9.4S17.5 2 12 2zm-4 10.6a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4zm4 0a1.2 1.2 0 1 1 0-2.4 1.2 1.2 0 0 1 0 2.4z" />
        </svg>
      )}
    </button>
  );
}
