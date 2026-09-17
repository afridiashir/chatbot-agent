"use client";

const MUTED_KEY = "mbca.sound.muted";

/**
 * Notification chimes for the agent inbox, synthesised with the Web Audio API
 * rather than shipped as files: two short tones cost nothing to download and
 * cannot 404 behind a CDN.
 */
export type Chime = "message" | "newChat";

/** Frequencies in Hz and their start offsets in seconds. */
const TONES: Record<Chime, Array<{ hz: number; at: number; ms: number }>> = {
  // Two soft notes, like a phone's message tone.
  message: [
    { hz: 880, at: 0, ms: 90 },
    { hz: 1175, at: 0.09, ms: 140 },
  ],
  // A brighter rising three-note figure: a new chat deserves attention.
  newChat: [
    { hz: 784, at: 0, ms: 110 },
    { hz: 1046, at: 0.11, ms: 110 },
    { hz: 1319, at: 0.22, ms: 220 },
  ],
};

let context: AudioContext | null = null;

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
 * Browsers only allow audio once the person has interacted with the page, so
 * the context is resumed on the first click or key press after sign-in.
 */
export function unlockSound(): void {
  const ctx = audioContext();
  if (ctx?.state === "suspended") void ctx.resume();
}

/** Plays a chime, unless muted or the browser refuses to make sound. */
export function playChime(chime: Chime): void {
  if (isMuted()) return;
  const ctx = audioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // Not allowed to play yet: staying silent beats throwing.
    void ctx.resume();
    return;
  }

  const now = ctx.currentTime;
  for (const tone of TONES[chime]) {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = tone.hz;

    const start = now + tone.at;
    const end = start + tone.ms / 1000;
    // A short fade in and out, so the note does not click.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }
}
