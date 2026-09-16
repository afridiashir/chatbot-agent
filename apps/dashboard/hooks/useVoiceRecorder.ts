"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { VOICE_MAX_MS, WAVEFORM_BARS } from "@repo/types";

export interface VoiceNote {
  blob: Blob;
  durationMs: number;
  fileName: string;
  /** Loudness bars 0-100, stored with the note and drawn as its waveform. */
  waveform: number[];
}

/** Container formats storage accepts for voice notes, in order of preference. */
const CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

/** How often the microphone level is sampled, for the live bars and the waveform. */
const SAMPLE_MS = 50;
/** Bars shown scrolling past while recording. */
export const LIVE_BARS = 40;

/**
 * Squeezes every level sampled during recording into a fixed number of bars,
 * keeping each bucket's peak (so short syllables still show) and scaling to the
 * loudest moment, the way a voice-note waveform looks in a chat app.
 */
export function toWaveform(samples: number[], bars = WAVEFORM_BARS): number[] {
  if (samples.length === 0) return [];
  const bucket = samples.length / bars;
  const peaks = Array.from({ length: bars }, (_, i) => {
    const from = Math.floor(i * bucket);
    const to = Math.max(from + 1, Math.floor((i + 1) * bucket));
    return Math.max(...samples.slice(from, Math.min(to, samples.length)), 0);
  });
  const loudest = Math.max(...peaks, 0.001);
  // Square root, like the ear: quieter speech still reads next to the loudest
  // moment instead of flattening out. The floor keeps pauses as short lines.
  return peaks.map((peak) => Math.max(10, Math.round(Math.sqrt(peak / loudest) * 100)));
}

/**
 * Records a voice note from the microphone, with live loudness levels for the
 * recording bar. Stops on its own at the maximum length, and always releases
 * the microphone so the browser's recording indicator goes away.
 */
export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  /** The most recent levels (0-1), newest last, for the live bars. */
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const samplesRef = useRef<number[]>([]);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resolveRef = useRef<((note: VoiceNote | null) => void) | null>(null);
  const cancelledRef = useRef(false);

  const release = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
    recorderRef.current = null;
    setRecording(false);
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    setError(null);
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Voice notes aren't supported in this browser.");
      return;
    }
    const mimeType = CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
    if (!mimeType) {
      setError("This browser can't record a supported audio format.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access was blocked. Allow it in the browser to record.");
      return;
    }

    // Loudness meter: an analyser on the same stream the recorder uses.
    let analyser: AnalyserNode | null = null;
    try {
      const context = new AudioContext();
      analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
    } catch {
      analyser = null; // Recording still works; the bars just stay flat.
    }
    const buffer = analyser ? new Uint8Array(analyser.fftSize) : null;

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];
    samplesRef.current = [];
    cancelledRef.current = false;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.onstop = () => {
      const durationMs = Math.min(Date.now() - startedAtRef.current, VOICE_MAX_MS);
      const type = mimeType.split(";")[0]!;
      const extension = type === "audio/mp4" ? "m4a" : type === "audio/ogg" ? "ogg" : "webm";
      const blob = new Blob(chunksRef.current, { type });
      const waveform = toWaveform(samplesRef.current);
      release();
      const note =
        cancelledRef.current || blob.size === 0 || durationMs < 500
          ? null
          : { blob, durationMs, fileName: `voice-note-${Date.now()}.${extension}`, waveform };
      resolveRef.current?.(note);
      resolveRef.current = null;
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    setLevels([]);
    setRecording(true);
    recorder.start(250);

    tickRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);

      if (analyser && buffer) {
        analyser.getByteTimeDomainData(buffer);
        // RMS of the waveform around its 128 midpoint, lifted so speech fills the bar.
        let sum = 0;
        for (const value of buffer) sum += ((value - 128) / 128) ** 2;
        const level = Math.min(1, Math.sqrt(sum / buffer.length) * 4);
        samplesRef.current.push(level);
        setLevels((current) => [...current.slice(-(LIVE_BARS - 1)), level]);
      }

      if (elapsed >= VOICE_MAX_MS && recorder.state === "recording") recorder.stop();
    }, SAMPLE_MS);
  }, [release]);

  /** Stops and resolves to the finished note (null if too short or empty). */
  const finish = useCallback(
    () =>
      new Promise<VoiceNote | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        resolveRef.current = resolve;
        recorder.stop();
      }),
    [],
  );

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    cancelledRef.current = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else release();
  }, [release]);

  return {
    recording,
    elapsedMs,
    levels,
    error,
    start,
    finish,
    cancel,
    clearError: () => setError(null),
  };
}

export const formatDuration = (ms: number) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/**
 * Bars for a note with no stored waveform (uploaded audio, or notes sent before
 * waveforms existed): a stable pseudo-random shape from the attachment id, so
 * it still reads as a voice note and looks the same on every render.
 */
export function placeholderWaveform(seed: string, bars = WAVEFORM_BARS): number[] {
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (state * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: bars }, (_, i) => {
    state = (state * 1664525 + 1013904223) >>> 0;
    const envelope = 0.55 + 0.45 * Math.sin((i / bars) * Math.PI);
    return Math.max(12, Math.round(((state % 1000) / 1000) * 100 * envelope));
  });
}
