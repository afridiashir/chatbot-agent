import { useEffect, useRef, useState } from "react";
import { formatBytes, type MessageAttachment } from "@repo/types";
import { formatDuration, placeholderWaveform } from "../hooks/useVoiceRecorder.js";
import { AgentAvatar } from "./AgentAvatar.js";
import { Waveform } from "./Waveform.js";

/** Media inside a widget chat bubble. */
export function MessageMedia({
  apiUrl,
  attachment,
  outgoing,
  agent,
  footer,
  onOpen,
}: {
  apiUrl: string;
  attachment: MessageAttachment;
  /** Sent by the visitor (right, green) rather than the agent. */
  outgoing: boolean;
  agent: { name: string; photo: string | null };
  /** Time and ticks, drawn inside a voice note's own layout. */
  footer?: React.ReactNode;
  /** Opens a photo or video in the full-size viewer. */
  onOpen?: () => void;
}) {
  const src = `${apiUrl}${attachment.url}`;
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <p className="px-2 py-4 text-xs text-wa-meta">Media unavailable, reopen the chat.</p>;
  }

  if (attachment.kind === "IMAGE") {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View photo ${attachment.fileName}`}
        className="block w-full cursor-zoom-in overflow-hidden rounded-md"
      >
        <img
          src={src}
          alt={attachment.fileName}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-64 w-full min-w-40 object-cover"
        />
      </button>
    );
  }

  if (attachment.kind === "VIDEO") {
    return (
      // A still frame with a play badge; it plays in the viewer, like WhatsApp.
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Play video ${attachment.fileName}`}
        className="relative block w-64 max-w-full overflow-hidden rounded-md bg-black"
      >
        <video
          // #t nudges iOS Safari into painting a first frame.
          src={`${src}#t=0.1`}
          preload="metadata"
          muted
          playsInline
          onError={() => setFailed(true)}
          className="pointer-events-none max-h-64 w-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/50 text-white">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor">
              <path d="M7 4.5v15l12.5-7.5z" />
            </svg>
          </span>
        </span>
        <span className="absolute bottom-1 left-2 text-[11px] text-white drop-shadow">
          {formatBytes(attachment.size)}
        </span>
      </button>
    );
  }

  if (attachment.kind === "VOICE") {
    return (
      <VoicePlayer
        apiUrl={apiUrl}
        src={src}
        seed={attachment.id}
        waveform={attachment.waveform ?? []}
        durationMs={attachment.durationMs}
        outgoing={outgoing}
        agent={agent}
        footer={footer}
      />
    );
  }

  return (
    <div className="flex w-60 max-w-full flex-col gap-1.5 p-1">
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ff9500] text-white"
          aria-hidden="true"
        >
          ♪
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-medium">{attachment.fileName}</p>
          <p className="text-[11px] text-wa-meta">{formatBytes(attachment.size)}</p>
        </div>
      </div>
      <audio src={src} controls preload="metadata" className="h-8 w-full" />
    </div>
  );
}

const SPEEDS = [1, 1.5, 2] as const;

/**
 * WhatsApp's voice note: photo with a mic badge, a bare play button, the
 * waveform with a playhead, duration bottom-left and time bottom-right. The
 * photo becomes a speed toggle while playing.
 */
function VoicePlayer({
  apiUrl,
  src,
  seed,
  waveform,
  durationMs,
  outgoing,
  agent,
  footer,
}: {
  apiUrl: string;
  src: string;
  seed: string;
  waveform: number[];
  durationMs: number | null;
  outgoing: boolean;
  agent: { name: string; photo: string | null };
  footer?: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const bars = waveform.length > 0 ? waveform : placeholderWaveform(seed);

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
    const onPlay = () => {
      setPlaying(true);
      setPlayed(true);
    };
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

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setPlaying(false));
    else audio.pause();
  };

  const progress = duration > 0 ? Math.min(1, position / duration) : 0;
  const shown = playing || position > 0 ? position : duration;
  const accent = played ? "bg-wa-blue" : outgoing ? "bg-wa-meta" : "bg-wa-green";
  const micColor = played ? "text-wa-blue" : outgoing ? "text-wa-meta" : "text-wa-green";

  const photo = (
    <span className="relative flex h-11 w-11 shrink-0 items-center justify-center">
      {playing ? (
        <button
          type="button"
          onClick={() =>
            setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length]!)
          }
          aria-label={`Playback speed ${speed}x, change`}
          className="h-6 min-w-10 rounded-full bg-wa-icon/85 px-1.5 text-[11px] font-semibold text-white"
        >
          {speed}×
        </button>
      ) : outgoing ? (
        // The visitor has no photo; WhatsApp shows the default one.
        <AgentAvatar apiUrl={apiUrl} name="You" photo={null} size={44} />
      ) : (
        <AgentAvatar apiUrl={apiUrl} name={agent.name} photo={agent.photo} size={44} />
      )}
      {!playing && (
        <svg
          viewBox="0 0 24 24"
          className={`absolute bottom-0 h-4 w-4 drop-shadow ${micColor} ${outgoing ? "-left-0.5" : "-right-0.5"}`}
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15zm6-3.5a.9.9 0 1 0-1.8 0 4.2 4.2 0 0 1-8.4 0 .9.9 0 1 0-1.8 0 6 6 0 0 0 5.1 5.9V20H9a.9.9 0 1 0 0 1.8h6a.9.9 0 1 0 0-1.8h-2.1v-2.6a6 6 0 0 0 5.1-5.9z" />
        </svg>
      )}
    </span>
  );

  return (
    <div className="flex w-[17rem] max-w-full items-center gap-1.5 px-1 pt-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      {!outgoing && photo}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className="flex h-8 w-8 shrink-0 items-center justify-center text-wa-icon"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden="true">
            <path d="M7 4.5v15l12.5-7.5z" />
          </svg>
        )}
      </button>
      <div className="relative min-w-0 flex-1 pb-4">
        <Waveform
          bars={bars}
          progress={progress}
          playedClass={played ? "bg-wa-blue" : outgoing ? "bg-wa-meta" : "bg-wa-green"}
          unplayedClass="bg-wa-meta/40"
          thumbClass={accent}
          onSeek={(fraction) => {
            const audio = audioRef.current;
            if (!audio || !duration) return;
            audio.currentTime = fraction * duration;
            setPosition(fraction * duration);
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between text-[11px] leading-none text-wa-meta">
          <span className="tabular-nums">{formatDuration(shown * 1000)}</span>
          {footer}
        </div>
      </div>
      {outgoing && photo}
    </div>
  );
}
