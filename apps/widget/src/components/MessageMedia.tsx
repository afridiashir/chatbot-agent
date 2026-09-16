import { useEffect, useRef, useState } from "react";
import { formatBytes, type MessageAttachment } from "@repo/types";
import { formatDuration, placeholderWaveform } from "../hooks/useVoiceRecorder.js";
import { Waveform } from "./Waveform.js";

/** Media inside a widget chat bubble. */
export function MessageMedia({
  apiUrl,
  attachment,
  fromVisitor,
}: {
  apiUrl: string;
  attachment: MessageAttachment;
  fromVisitor: boolean;
}) {
  const src = `${apiUrl}${attachment.url}`;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="px-2 py-4 text-xs opacity-70">Media unavailable, reopen the chat.</p>;
  }

  if (attachment.kind === "IMAGE") {
    return (
      // Opens full size in a new tab; the widget has no room for a viewer.
      <a href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl">
        <img
          src={src}
          alt={attachment.fileName}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-60 w-auto max-w-full object-cover"
        />
      </a>
    );
  }

  if (attachment.kind === "VIDEO") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        onError={() => setFailed(true)}
        className="max-h-60 w-full rounded-xl bg-black"
      />
    );
  }

  if (attachment.kind === "VOICE") {
    return (
      <VoicePlayer
        src={src}
        seed={attachment.id}
        waveform={attachment.waveform ?? []}
        durationMs={attachment.durationMs}
        fromVisitor={fromVisitor}
      />
    );
  }

  return (
    <div className="flex w-56 max-w-full flex-col gap-1.5 p-1">
      <p className="truncate text-xs font-medium">🎵 {attachment.fileName}</p>
      <p className="text-[10px] opacity-70">{formatBytes(attachment.size)}</p>
      <audio src={src} controls preload="metadata" className="h-8 w-full" />
    </div>
  );
}

function VoicePlayer({
  src,
  seed,
  waveform,
  durationMs,
  fromVisitor,
}: {
  src: string;
  seed: string;
  waveform: number[];
  durationMs: number | null;
  fromVisitor: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const bars = waveform.length > 0 ? waveform : placeholderWaveform(seed, 36);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPosition(audio.currentTime);
    const onMeta = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) setDuration(audio.duration);
    };
    const onEnd = () => {
      setPlaying(false);
      setPosition(0);
    };
    const onPause = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("play", onPlay);
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <div className="flex w-56 max-w-full items-center gap-2 py-0.5">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={[
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          fromVisitor ? "bg-white text-slate-900" : "bg-slate-900 text-white",
        ].join(" ")}
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 24 24"
            className="ml-0.5 h-3.5 w-3.5"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M7 5v14l12-7z" />
          </svg>
        )}
      </button>
      <Waveform
        bars={bars}
        progress={progress}
        playedClass={fromVisitor ? "bg-white" : "bg-slate-900"}
        unplayedClass={fromVisitor ? "bg-white/40" : "bg-slate-400/60"}
        onSeek={(fraction) => {
          const audio = audioRef.current;
          if (!audio || !duration) return;
          audio.currentTime = fraction * duration;
          setPosition(fraction * duration);
        }}
      />
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums opacity-80">
        {formatDuration((playing || position > 0 ? position : duration) * 1000)}
      </span>
    </div>
  );
}
