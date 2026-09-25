import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@repo/db";
import {
  MEDIA_RULES,
  VOICE_MAX_MS,
  baseMimeType,
  type AttachmentKind,
  type UploadTicket,
} from "@repo/types";
import type { CreateUploadBody } from "@repo/validation";
import { env } from "../env.js";
import type { Actor } from "../lib/actor.js";
import { mediaClaims } from "../lib/media-link.js";
import { forbidden, HttpError, notFound } from "../lib/http.js";
import {
  createUploadForm,
  deleteObject,
  headObject,
  presignDownload,
  readObjectPrefix,
} from "../lib/storage.js";
import { assertConversationAccess } from "./conversations.js";

/** How long a granted upload form stays usable. */
const UPLOAD_FORM_SECONDS = 5 * 60;
/** How long the client may take between uploading and sending the message. */
const UPLOAD_TOKEN_TTL = "30m";
/** Lifetime of the storage URL that link redirects to. */
const DOWNLOAD_URL_SECONDS = 5 * 60;

const invalid = (message: string, field = "attachment") =>
  new HttpError(400, "VALIDATION_ERROR", message, { [field]: [message] });

/* --------------------------------- tokens ---------------------------------- */

/**
 * Upload tokens are signed with the session secret but carry a `typ`
 * claim and no `role`, so neither can ever pass as a session token (session
 * verification requires a role), and neither can stand in for the other.
 */
const uploadClaims = z.object({
  typ: z.literal("upload"),
  key: z.string(),
  // From the shared list, so a kind added there does not have to be remembered
  // here as well.
  kind: z.enum(Object.keys(MEDIA_RULES) as [AttachmentKind, ...AttachmentKind[]]),
  mimeType: z.string(),
  fileName: z.string(),
  conversationId: z.string(),
  senderType: z.enum(["AGENT", "VISITOR"]),
  maxBytes: z.number(),
});

/* ------------------------------- magic bytes ------------------------------- */

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((value, i) => bytes[offset + i] === value);
const ascii = (bytes: Uint8Array, text: string, offset = 0) =>
  startsWith(
    bytes,
    [...text].map((c) => c.charCodeAt(0)),
    offset,
  );

/**
 * Does the file actually look like the type it was uploaded as? The declared
 * Content-Type is just a claim from the browser; this checks the container
 * format so, say, an HTML page renamed to .png is rejected.
 */
export function looksLike(mimeType: string, bytes: Uint8Array): boolean {
  const isoMedia = ascii(bytes, "ftyp", 4); // MP4, MOV, M4A
  const matroska = startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]); // WebM
  switch (mimeType) {
    case "image/jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "image/png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "image/gif":
      return ascii(bytes, "GIF87a") || ascii(bytes, "GIF89a");
    case "image/webp":
      return ascii(bytes, "RIFF") && ascii(bytes, "WEBP", 8);
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
    case "audio/x-m4a":
      return isoMedia;
    case "video/webm":
    case "audio/webm":
      return matroska;
    case "audio/ogg":
      return ascii(bytes, "OggS");
    case "audio/wav":
    case "audio/x-wav":
      return ascii(bytes, "RIFF") && ascii(bytes, "WAVE", 8);
    case "audio/mpeg":
      return ascii(bytes, "ID3") || (bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);
    case "audio/aac":
      return bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xf6) === 0xf0;

    // Documents. The check is weaker here by nature — a spreadsheet and an
    // archive are the same ZIP container, and a text file has no signature at
    // all — but it matters less: a file is served as a download and never
    // rendered, so one that is secretly markup has nowhere to run.
    case "application/pdf":
      return ascii(bytes, "%PDF");
    case "application/zip":
    case "application/x-zip-compressed":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      // "PK" — every Office file since 2007 is a ZIP, as is a plain archive.
      return startsWith(bytes, [0x50, 0x4b]);
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      // The old OLE compound document, which all three share.
      return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "text/plain":
    case "text/csv":
      // Nothing to check: text is whatever bytes it happens to be.
      return true;

    default:
      return false;
  }
}

/* --------------------------------- uploads --------------------------------- */

/**
 * An admin stepping into a chat uploads as the agent, for the same reason their
 * messages are stored as the agent: the visitor sees one person throughout.
 * A visitor's upload is always the visitor's.
 */
function senderOf(actor: Actor): "AGENT" | "VISITOR" {
  return actor.type === "VISITOR" ? "VISITOR" : "AGENT";
}

/**
 * Grants a single upload into one open conversation. The object key is chosen
 * here, never by the client, and is namespaced by conversation.
 */
export async function createUpload(
  conversationId: string,
  input: CreateUploadBody,
  actor: Actor,
): Promise<UploadTicket> {
  const senderType = senderOf(actor);
  await assertConversationAccess(conversationId, actor);

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { status: true },
  });
  if (!conversation) throw notFound("Conversation not found");
  if (conversation.status === "CLOSED") {
    throw new HttpError(409, "CONFLICT", "This conversation has been closed");
  }

  const mimeType = baseMimeType(input.mimeType);
  const rules = MEDIA_RULES[input.kind];
  if (!rules.mimeTypes.includes(mimeType)) {
    throw invalid(`That file type can't be sent as ${input.kind.toLowerCase()}`, "mimeType");
  }
  const maxBytes = rules.maxBytes[senderType];
  if (input.size > maxBytes) {
    throw invalid(`File is too large (max ${Math.round(maxBytes / 1024 / 1024)} MB)`, "size");
  }

  const extension = (input.fileName.match(/\.([A-Za-z0-9]{1,5})$/)?.[1] ?? "bin").toLowerCase();
  const key = `conversations/${conversationId}/${randomUUID()}.${extension}`;

  const form = await createUploadForm({
    key,
    contentType: mimeType,
    maxBytes,
    expiresSeconds: UPLOAD_FORM_SECONDS,
  });

  const uploadToken = jwt.sign(
    {
      typ: "upload",
      key,
      kind: input.kind,
      mimeType,
      fileName: input.fileName,
      conversationId,
      senderType,
      maxBytes,
    } satisfies z.infer<typeof uploadClaims>,
    env.JWT_SECRET,
    { expiresIn: UPLOAD_TOKEN_TTL },
  );

  return { url: form.url, fields: form.fields, uploadToken, maxBytes };
}

export interface VerifiedUpload {
  key: string;
  kind: AttachmentKind;
  mimeType: string;
  fileName: string;
  size: number;
  durationMs: number | null;
  waveform: number[];
}

/**
 * Confirms an upload before a message may reference it: the token was issued
 * for this conversation and sender, the object exists within the size granted,
 * and its bytes match its declared type. A file that fails is deleted.
 */
export async function verifyUpload(
  uploadToken: string,
  conversationId: string,
  senderType: "AGENT" | "VISITOR",
  durationMs: number | undefined,
  waveform: number[] | undefined,
): Promise<VerifiedUpload> {
  let claims: z.infer<typeof uploadClaims>;
  try {
    claims = uploadClaims.parse(jwt.verify(uploadToken, env.JWT_SECRET));
  } catch {
    throw invalid("The upload expired or is invalid. Please attach the file again.");
  }
  if (claims.conversationId !== conversationId || claims.senderType !== senderType) {
    throw invalid("That upload belongs to a different conversation.");
  }

  const alreadyUsed = await prisma.attachment.findUnique({
    where: { key: claims.key },
    select: { id: true },
  });
  if (alreadyUsed) throw invalid("That file has already been sent.");

  const head = await headObject(claims.key);
  if (!head) throw invalid("The file has not finished uploading.");
  if (head.size <= 0 || head.size > claims.maxBytes) {
    await deleteObject(claims.key);
    throw invalid("The uploaded file is empty or too large.");
  }

  const prefix = await readObjectPrefix(claims.key, 16);
  if (!looksLike(claims.mimeType, prefix)) {
    await deleteObject(claims.key);
    throw invalid("The file's contents don't match its type.");
  }

  const duration =
    claims.kind === "VOICE" || claims.kind === "AUDIO"
      ? durationMs !== undefined
        ? Math.min(
            Math.max(0, Math.round(durationMs)),
            claims.kind === "VOICE" ? VOICE_MAX_MS : 24 * 3600 * 1000,
          )
        : null
      : null;

  return {
    key: claims.key,
    kind: claims.kind,
    mimeType: claims.mimeType,
    fileName: claims.fileName,
    size: head.size,
    durationMs: duration,
    // Only a recording has a meaningful waveform; ignore one sent with a photo.
    waveform: claims.kind === "VOICE" ? (waveform ?? []) : [],
  };
}

/* -------------------------------- downloads -------------------------------- */

/** Resolves a signed media link to a short-lived storage URL. */
export async function resolveMedia(attachmentId: string, sig: string): Promise<string> {
  try {
    const claims = mediaClaims.parse(jwt.verify(sig, env.JWT_SECRET));
    if (claims.aid !== attachmentId) throw new Error("mismatch");
  } catch {
    throw new HttpError(403, "FORBIDDEN", "This media link has expired. Reload the conversation.");
  }

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) throw notFound("Media not found");

  return presignDownload({
    key: attachment.key,
    contentType: attachment.mimeType,
    fileName: attachment.fileName,
    expiresSeconds: DOWNLOAD_URL_SECONDS,
    // A photo or a video is meant to be seen in the page; a document is meant
    // to be kept, and serving it as a download is also what stops one that is
    // secretly markup from being rendered by the browser.
    disposition: attachment.kind === "FILE" ? "attachment" : "inline",
  });
}
