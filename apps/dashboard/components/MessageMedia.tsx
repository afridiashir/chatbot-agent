"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Mic, Music, Pause, Play } from "lucide-react";
import { formatBytes, type MessageAttachment } from "@repo/types";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Waveform } from "@/components/Waveform";
import { formatDuration, placeholderWaveform } from "@/hooks/useVoiceRecorder";
import { mediaUrl } from "@/lib/media";
import { cn } from "@/lib/utils";

/** Renders an image, video, audio file or voice note inside a chat bubble. */
export function MessageMedia({
  attachment,
  outgoing,
  sender,
  footer,
}: {
  attachment: MessageAttachment;
  outgoing: boolean;
  /** Voice notes show who is speaking. */
  sender?: { name: string; seed: string; photo?: string | null };
  /** Voice notes carry the time and ticks inside their own layout. */
  footer?: React.ReactNode;
}) {
  const src = mediaUrl(attachment.url);

  if (attachment.kind === "IMAGE") return <ImageMedia attachment={attachment} src={src} />;

  if (attachment.kind === "VIDEO") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        className="max-h-80 w-72 max-w-full rounded-md bg-black"
      >
        <a href={src}>Download {attachment.fileName}</a>
      </video>
    );
  }

  if (attachment.kind === "FILE") {
    return (
      <a
        href={src}
        // The link is signed and short-lived, and the server sends it back with
        // a download disposition, so this saves the file rather than opening it.
        download={attachment.fileName}
        className="flex w-64 max-w-full items-center gap-2.5 rounded-md p-1.5 no-underline transition-colors hover:bg-foreground/5"
      >
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-foreground/10 text-[11px] font-semibold tracking-wide text-chat-meta uppercase"
          aria-hidden
        >
          {extensionOf(attachment.fileName)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{attachment.fileName}</span>
          <span className="block text-[11px] text-chat-meta">
            {formatBytes(attachment.size)} · Download
          </span>
        </span>
      </a>
    );
  }

  if (attachment.kind === "VOICE") {
    return (
      <VoicePlayer
        src={src}
        seed={attachment.id}
        waveform={attachment.waveform ?? []}
        durationMs={attachment.durationMs}
        outgoing={outgoing}
        sender={sender}
        footer={footer}
      />
    );
  }

  return (
    <div className="flex w-64 max-w-full flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-black/10">
          <Music className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{attachment.fileName}</p>
          <p className="text-[11px] text-chat-meta">{formatBytes(attachment.size)}</p>
        </div>
      </div>
      <audio src={src} controls preload="metadata" className="h-9 w-full" />
    </div>
  );
}

function ImageMedia({ attachment, src }: { attachment: MessageAttachment; src: string }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <p className="w-56 rounded-md bg-black/5 px-3 py-6 text-center text-xs text-chat-meta">
        Image unavailable. Reload the conversation.
      </p>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block overflow-hidden rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={`Open image ${attachment.fileName}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed, short-lived URLs */}
        <img
          src={src}
          alt={attachment.fileName}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-h-80 w-auto max-w-72 object-cover"
        />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={attachment.fileName}
        description={formatBytes(attachment.size)}
        className="max-w-4xl"
      >
        <div className="flex flex-col items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={attachment.fileName} className="max-h-[70vh] w-auto rounded-lg" />
          <a
            href={src}
            download={attachment.fileName}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Download className="size-4" aria-hidden />
            Download
          </a>
        </div>
      </Dialog>
    </>
  );
}

const SPEEDS = [1, 1.5, 2] as const;

/**
 * A voice note laid out like WhatsApp: the sender's photo with a mic badge
 * (on the left for incoming, right for outgoing), a bare play button, the
 * waveform with a round playhead, and the duration and time along the bottom.
 * While playing, the photo becomes a 1× / 1.5× / 2× speed toggle.
 */
export function VoicePlayer({
  src,
  seed,
  waveform,
  durationMs,
  outgoing,
  sender,
  footer,
}: {
  src: string;
  /** Stable id, used to draw a placeholder shape when no waveform was stored. */
  seed: string;
  waveform: number[];
  durationMs: number | null;
  outgoing: boolean;
  /** Whose voice it is; shown as the photo beside the player. */
  sender?: { name: string; seed: string; photo?: string | null };
  /** Bottom-right of the bubble: time and ticks. */
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
    // Recorded WebM often reports Infinity until played; keep the stored length then.
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
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("play", onPlay);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
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

  const total = duration || 0;
  const progress = total > 0 ? Math.min(1, position / total) : 0;
  const shown = playing || position > 0 ? position : total;
  // WhatsApp's blue: a note that has been listened to.
  const accent = played ? "bg-[#53bdeb]" : outgoing ? "bg-chat-meta" : "bg-primary";

  const photo = (
    <div className="relative flex size-12 shrink-0 items-center justify-center">
      {playing ? (
        <button
          type="button"
          onClick={() =>
            setSpeed((current) => SPEEDS[(SPEEDS.indexOf(current) + 1) % SPEEDS.length]!)
          }
          aria-label={`Playback speed ${speed}x, change`}
          className="h-7 min-w-11 rounded-full bg-[#54656f]/85 px-2 text-xs font-semibold text-white transition-colors hover:bg-[#54656f]"
        >
          {speed}×
        </button>
      ) : sender ? (
        <>
          <Avatar name={sender.name} seed={sender.seed} photo={sender.photo} size="lg" />
          <span
            aria-hidden
            className={cn(
              "absolute bottom-0 flex size-5 items-center justify-center",
              outgoing ? "-left-1" : "-right-1",
            )}
          >
            <Mic
              className={cn(
                "size-4 drop-shadow",
                played ? "text-[#53bdeb]" : outgoing ? "text-chat-meta" : "text-primary",
              )}
              strokeWidth={2.5}
            />
          </span>
        </>
      ) : (
        <span
          className={cn("flex size-12 items-center justify-center rounded-full text-white", accent)}
        >
          <Mic className="size-5" aria-hidden />
        </span>
      )}
    </div>
  );

  return (
    <div className="flex w-[21rem] max-w-full items-center gap-2 px-1.5 pt-1.5 pb-1">
      <audio ref={audioRef} src={src} preload="metadata" />
      {!outgoing && photo}
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className="flex size-9 shrink-0 items-center justify-center text-chat-meta transition-colors hover:text-foreground"
      >
        {playing ? (
          <Pause className="size-6" fill="currentColor" strokeWidth={0} />
        ) : (
          <Play className="size-6" fill="currentColor" strokeWidth={0} />
        )}
      </button>
      <div className="relative min-w-0 flex-1 pb-4">
        <Waveform
          bars={bars}
          progress={progress}
          playedClass={played ? "bg-[#53bdeb]" : outgoing ? "bg-chat-meta" : "bg-primary"}
          unplayedClass="bg-chat-meta/40"
          thumbClass={accent}
          onSeek={(fraction) => {
            const audio = audioRef.current;
            if (!audio || !total) return;
            audio.currentTime = fraction * total;
            setPosition(fraction * total);
          }}
        />
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between text-[11px] leading-none text-chat-meta">
          <span className="tabular-nums">{formatDuration(shown * 1000)}</span>
          {footer}
        </div>
      </div>
      {outgoing && photo}
    </div>
  );
}

/**
 * The three or four letters on the tile. Better than one icon for everything:
 * the reader can tell a PDF from a spreadsheet without opening either.
 */
function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const extension = dot > 0 ? fileName.slice(dot + 1) : "";
  return extension.length >= 1 && extension.length <= 4 ? extension : "FILE";
}
