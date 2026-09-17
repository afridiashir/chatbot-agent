"use client";

const MUTED_KEY = "mbca.sound.muted";

/**
 * Notification sounds for the agent inbox.
 *
 * Two sources, in order: an audio file dropped into `public/sounds` (see
 * FILES below), or, when there is none, a tone synthesised with the Web Audio
 * API. The synthesised one is a short percussive bell — a struck-metal attack
 * with a fast decay, the shape most messaging apps use — because chat tones
 * such as WhatsApp's own are copyrighted and cannot be shipped here.
 */
export type Chime = "message" | "newChat";

/** Drop a file at either path and it is used in place of the synth tone. */
const FILES: Record<Chime, string> = {
  message: "/sounds/message.mp3",
  newChat: "/sounds/new-chat.mp3",
};

/**
 * Partials of one struck bell: frequency relative to the root, how loud, and
 * how fast it dies away. The inharmonic ratios are what stop it sounding like
 * a plain beep.
 */
const PARTIALS = [
  { ratio: 1, gain: 1, decay: 1 },
  { ratio: 2.76, gain: 0.34, decay: 0.55 },
  { ratio: 5.4, gain: 0.16, decay: 0.3 },
];

/** Root notes and their offsets: two quick rising notes, then a longer one. */
const NOTES: Record<Chime, Array<{ hz: number; at: number; decay: number; gain: number }>> = {
  // Short and bright: a message landing.
  message: [
    { hz: 1318.5, at: 0, decay: 0.28, gain: 0.5 },
    { hz: 1760, at: 0.075, decay: 0.42, gain: 0.55 },
  ],
  // One note more, and it rings longer: someone new is waiting.
  newChat: [
    { hz: 1046.5, at: 0, decay: 0.26, gain: 0.5 },
    { hz: 1318.5, at: 0.085, decay: 0.3, gain: 0.5 },
    { hz: 1760, at: 0.17, decay: 0.75, gain: 0.6 },
  ],
};

let context: AudioContext | null = null;
/** null until tried; false once a file is known to be missing. */
const files = new Map<Chime, HTMLAudioElement | false>();

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    context ??= new Ctor();
    return context;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTED_KEY) === "1";
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    window.localStorage.setItem(MUTED_KEY, muted ? "1" : "0");
  } catch {
    // A browser with storage blocked simply forgets the choice.
  }
}

/**
 * Browsers keep audio silent until the person interacts with the page, so the
 * first click or key press after sign-in is what enables the sounds.
 */
export function unlockSound(): void {
  const ctx = audioContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/** One struck bell at `hz`, starting `at` seconds from now. */
function strike(
  ctx: AudioContext,
  note: { hz: number; at: number; decay: number; gain: number },
  now: number,
): void {
  const start = now + note.at;

  for (const partial of PARTIALS) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = note.hz * partial.ratio;

    const peak = 0.3 * note.gain * partial.gain;
    const end = start + note.decay * partial.decay;
    // Near-instant attack, then an exponential tail: a struck bar, not a beep.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}

/** Uses a file from `public/sounds` if there is one; returns false otherwise. */
function playFile(chime: Chime): boolean {
  const cached = files.get(chime);
  if (cached === false) return false;

  if (cached) {
    cached.currentTime = 0;
    void cached.play().catch(() => {});
    return true;
  }

  const audio = new Audio(FILES[chime]);
  audio.volume = 0.6;
  // A missing file is the normal case, so it is remembered rather than retried.
  audio.addEventListener("error", () => files.set(chime, false), { once: true });
  files.set(chime, audio);
  void audio.play().catch(() => {});
  return true;
}

/** Plays a notification sound, unless muted or the browser refuses. */
export function playChime(chime: Chime): void {
  if (isMuted()) return;
  if (playFile(chime)) return;

  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Not allowed to play yet: staying silent beats throwing.
    void ctx.resume();
    return;
  }

  const now = ctx.currentTime;
  for (const note of NOTES[chime]) strike(ctx, note, now);
}
