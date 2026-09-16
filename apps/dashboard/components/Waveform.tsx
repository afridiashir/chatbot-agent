"use client";

import { cn } from "@/lib/utils";

/**
 * WhatsApp-style voice waveform: rounded vertical bars, with the part already
 * played in the accent colour. Clicking or dragging across it seeks.
 */
export function Waveform({
  bars,
  progress,
  onSeek,
  playedClass,
  unplayedClass,
  thumbClass,
  className,
}: {
  /** Heights 0-100. */
  bars: number[];
  /** 0-1 of the way through playback. */
  progress: number;
  onSeek?: (fraction: number) => void;
  playedClass: string;
  unplayedClass: string;
  /** Adds WhatsApp's round playhead at the current position. */
  thumbClass?: string;
  className?: string;
}) {
  const playedBars = Math.round(progress * bars.length);

  function seekFrom(event: React.PointerEvent<HTMLDivElement>) {
    if (!onSeek) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  }

  return (
    <div
      role={onSeek ? "slider" : undefined}
      aria-label={onSeek ? "Seek voice message" : undefined}
      aria-valuemin={onSeek ? 0 : undefined}
      aria-valuemax={onSeek ? 100 : undefined}
      aria-valuenow={onSeek ? Math.round(progress * 100) : undefined}
      tabIndex={onSeek ? 0 : undefined}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seekFrom(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seekFrom(event);
      }}
      onKeyDown={(event) => {
        if (!onSeek) return;
        if (event.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
        if (event.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
      }}
      className={cn(
        // Bars share the width, so the waveform always fits beside the photo.
        "relative flex h-7 min-w-0 items-center gap-[2px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        onSeek && "cursor-pointer touch-none",
        className,
      )}
    >
      {bars.map((height, index) => (
        <span
          key={index}
          aria-hidden
          className={cn(
            "max-w-[3px] min-w-px flex-1 rounded-full transition-colors",
            index < playedBars ? playedClass : unplayedClass,
          )}
          style={{ height: `${Math.max(20, height)}%` }}
        />
      ))}
      {thumbClass && (
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm",
            thumbClass,
          )}
          style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
        />
      )}
    </div>
  );
}

/** The bars that move while recording: newest on the right, scrolling left. */
export function LiveWaveform({ levels, count }: { levels: number[]; count: number }) {
  const padded = [
    ...Array.from({ length: Math.max(0, count - levels.length) }, () => 0),
    ...levels,
  ];
  return (
    <div
      className="flex h-7 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden"
      aria-hidden
    >
      {padded.map((level, index) => (
        <span
          key={index}
          className={cn(
            "w-[3px] shrink-0 rounded-full transition-[height] duration-75",
            level > 0 ? "bg-primary" : "bg-chat-meta/30",
          )}
          style={{ height: `${Math.max(20, Math.round(Math.sqrt(level) * 100))}%` }}
        />
      ))}
    </div>
  );
}
