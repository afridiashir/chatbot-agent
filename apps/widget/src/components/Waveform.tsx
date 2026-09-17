/** Redraws stored bars at a narrower count, keeping each group's peak. */
function fit(bars: number[], count: number): number[] {
  if (bars.length <= count) return bars;
  const size = bars.length / count;
  return Array.from({ length: count }, (_, i) => {
    const from = Math.floor(i * size);
    const to = Math.max(from + 1, Math.floor((i + 1) * size));
    return Math.max(...bars.slice(from, to));
  });
}

/**
 * WhatsApp's voice waveform for the widget: bars that fill as the note plays,
 * with a round playhead. Click or drag to seek.
 */
export function Waveform({
  bars,
  progress,
  onSeek,
  playedClass,
  unplayedClass,
  thumbClass,
}: {
  bars: number[];
  progress: number;
  onSeek: (fraction: number) => void;
  playedClass: string;
  unplayedClass: string;
  thumbClass: string;
}) {
  const shown = fit(bars, 34);
  const played = Math.round(progress * shown.length);

  function seek(event: React.PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)));
  }

  return (
    <div
      role="slider"
      aria-label="Seek voice message"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        seek(event);
      }}
      onPointerMove={(event) => {
        if (event.buttons === 1) seek(event);
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onSeek(Math.min(1, progress + 0.05));
        if (event.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.05));
      }}
      className="relative flex h-6 min-w-0 flex-1 cursor-pointer touch-none items-center gap-[2px] outline-none"
    >
      {shown.map((height, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`max-w-[3px] min-w-px flex-1 rounded-full ${index < played ? playedClass : unplayedClass}`}
          style={{ height: `${Math.max(20, height)}%` }}
        />
      ))}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-sm ${thumbClass}`}
        style={{ left: `${Math.min(100, Math.max(0, progress * 100))}%` }}
      />
    </div>
  );
}

/** Bars that move with the microphone while recording, newest on the right. */
export function LiveWaveform({ levels, count }: { levels: number[]; count: number }) {
  const padded = [
    ...Array.from({ length: Math.max(0, count - levels.length) }, () => 0),
    ...levels.slice(-count),
  ];
  return (
    <div
      className="flex h-6 min-w-0 flex-1 items-center justify-end gap-[2px] overflow-hidden"
      aria-hidden="true"
    >
      {padded.map((level, index) => (
        <span
          key={index}
          className={`w-[2px] shrink-0 rounded-full ${level > 0 ? "bg-wa-green" : "bg-wa-meta/30"}`}
          style={{ height: `${Math.max(20, Math.round(Math.sqrt(level) * 100))}%` }}
        />
      ))}
    </div>
  );
}
