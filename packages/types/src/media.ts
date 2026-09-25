/**
 * What can be sent as media, shared by the API (which enforces it) and both
 * clients (which use it to reject a file before uploading it).
 */

export const AttachmentKind = {
  IMAGE: "IMAGE",
  VIDEO: "VIDEO",
  AUDIO: "AUDIO",
  VOICE: "VOICE",
  FILE: "FILE",
} as const;
export type AttachmentKind = (typeof AttachmentKind)[keyof typeof AttachmentKind];

const MB = 1024 * 1024;

/**
 * Allowed MIME types and per-sender size caps. Visitors are anonymous, so they
 * get tighter limits than signed-in agents. SVG is deliberately absent: it can
 * carry script.
 */
export const MEDIA_RULES: Record<
  AttachmentKind,
  { mimeTypes: readonly string[]; maxBytes: { AGENT: number; VISITOR: number } }
> = {
  IMAGE: {
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    maxBytes: { AGENT: 10 * MB, VISITOR: 5 * MB },
  },
  VIDEO: {
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime"],
    maxBytes: { AGENT: 50 * MB, VISITOR: 25 * MB },
  },
  AUDIO: {
    mimeTypes: [
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/ogg",
      "audio/wav",
      "audio/x-wav",
      "audio/webm",
    ],
    maxBytes: { AGENT: 20 * MB, VISITOR: 10 * MB },
  },
  VOICE: {
    mimeTypes: ["audio/webm", "audio/ogg", "audio/mp4"],
    maxBytes: { AGENT: 10 * MB, VISITOR: 10 * MB },
  },
  /**
   * Documents. Nothing here is ever rendered in the page — a file is handed
   * over as a download — which is why the list can be this broad without the
   * worry that governs the others.
   *
   * What is deliberately absent: anything a browser would treat as markup or
   * script. `text/html`, SVG and XML are not documents as far as this is
   * concerned, whatever they are called on disk.
   */
  FILE: {
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/zip",
      "application/x-zip-compressed",
      "text/plain",
      "text/csv",
    ],
    maxBytes: { AGENT: 25 * MB, VISITOR: 10 * MB },
  },
};

/** How many bars a voice-note waveform is stored with. */
export const WAVEFORM_BARS = 48;

/** Profile photos: small, common formats only. */
export const AVATAR_RULES = {
  mimeTypes: ["image/jpeg", "image/png", "image/webp"] as readonly string[],
  maxBytes: 2 * MB,
};

/** Longest voice note a recorder will produce. */
export const VOICE_MAX_MS = 5 * 60 * 1000;

/** `audio/webm;codecs=opus` → `audio/webm`. Rules are matched on the base type. */
export const baseMimeType = (mimeType: string) => mimeType.split(";")[0]!.trim().toLowerCase();

/**
 * The kind a picked file belongs to, or null if it cannot be sent.
 *
 * `FILE` is tried last on purpose: it is the catch-all for everything that is
 * not played or displayed, and a type that belongs to one of the others should
 * reach that one.
 */
export function kindForFile(mimeType: string): Exclude<AttachmentKind, "VOICE"> | null {
  const base = baseMimeType(mimeType);
  for (const kind of ["IMAGE", "VIDEO", "AUDIO", "FILE"] as const) {
    if (MEDIA_RULES[kind].mimeTypes.includes(base)) return kind;
  }
  return null;
}

/** File-input `accept` value covering everything that can be attached. */
export const ATTACHMENT_ACCEPT = [
  ...MEDIA_RULES.IMAGE.mimeTypes,
  ...MEDIA_RULES.VIDEO.mimeTypes,
  ...MEDIA_RULES.AUDIO.mimeTypes,
  ...MEDIA_RULES.FILE.mimeTypes,
  // Extensions as well as types: Windows reports .csv as several different
  // things depending on what is installed, and a file picker that silently
  // greys out a spreadsheet is worse than one that lets the server refuse it.
  ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv",
].join(",");

export const formatBytes = (bytes: number) =>
  bytes >= MB
    ? `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export interface MessageAttachment {
  id: string;
  kind: AttachmentKind;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs: number | null;
  /** Loudness bars 0-100 for a voice note's waveform; empty when unknown. */
  waveform: number[];
  /**
   * API path (prefix it with the API origin) that redirects to the file. Signed
   * and time-limited; a refetched message carries a fresh one.
   */
  url: string;
}

/** What `POST /api/conversations/:id/uploads` returns: a one-shot upload form. */
export interface UploadTicket {
  /** Browser POSTs multipart/form-data here, with `fields` first and `file` last. */
  url: string;
  fields: Record<string, string>;
  /** Pass back as `attachment.uploadToken` when sending the message. */
  uploadToken: string;
  maxBytes: number;
}

/** One-line description of a message, for list previews and notifications. */
export function describeAttachment(kind: AttachmentKind, durationMs?: number | null): string {
  if (kind === "IMAGE") return "📷 Photo";
  if (kind === "VIDEO") return "🎥 Video";
  if (kind === "AUDIO") return "🎵 Audio";
  if (kind === "FILE") return "📄 File";
  const seconds = Math.round((durationMs ?? 0) / 1000);
  return `🎤 Voice message${seconds ? ` (${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")})` : ""}`;
}
