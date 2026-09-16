import {
  AVATAR_RULES,
  MEDIA_RULES,
  baseMimeType,
  type Agent,
  type AttachmentKind,
  type UploadTicket,
} from "@repo/types";
import { api, ApiError } from "./api";
import { API_URL } from "./config";

/** Absolute URL for a message attachment's signed path. */
export const mediaUrl = (path: string) => `${API_URL}${path}`;

/** Rejects a file before any network round trip, with the same rules the API uses. */
export function checkFile(kind: AttachmentKind, file: Blob): string | null {
  const rules = MEDIA_RULES[kind];
  if (!rules.mimeTypes.includes(baseMimeType(file.type))) return "That file type can't be sent.";
  if (file.size > rules.maxBytes.AGENT) {
    return `That file is too large (max ${Math.round(rules.maxBytes.AGENT / 1024 / 1024)} MB).`;
  }
  return null;
}

/**
 * Uploads straight to storage with a one-shot form from the API, reporting
 * progress, and resolves to the token the message is then sent with.
 */
export async function uploadAttachment(input: {
  conversationId: string;
  token: string;
  kind: AttachmentKind;
  file: Blob;
  fileName: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}): Promise<string> {
  const mimeType = baseMimeType(input.file.type);
  const ticket = await api<UploadTicket>(`/api/conversations/${input.conversationId}/uploads`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({
      kind: input.kind,
      fileName: input.fileName,
      mimeType,
      size: input.file.size,
    }),
  });

  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  // Re-typed to the base MIME type: storage checks it against the granted one.
  form.append("file", new Blob([input.file], { type: mimeType }), input.fileName);

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError("Upload was rejected by storage", "UPLOAD_FAILED"));
    xhr.onerror = () =>
      reject(new ApiError("Upload failed, check your connection", "NETWORK_ERROR"));
    xhr.onabort = () => reject(new ApiError("Upload cancelled", "ABORTED"));
    input.signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(form);
  });

  return ticket.uploadToken;
}

/** Posts a file to storage with a one-shot form, reporting progress. */
function postToStorage(
  ticket: UploadTicket,
  file: Blob,
  fileName: string,
  onProgress?: (fraction: number) => void,
): Promise<void> {
  const mimeType = baseMimeType(file.type);
  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
  form.append("file", new Blob([file], { type: mimeType }), fileName);
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ticket.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError("Upload was rejected by storage", "UPLOAD_FAILED"));
    xhr.onerror = () =>
      reject(new ApiError("Upload failed, check your connection", "NETWORK_ERROR"));
    xhr.send(form);
  });
}

export function checkAvatar(file: Blob): string | null {
  if (!AVATAR_RULES.mimeTypes.includes(baseMimeType(file.type))) {
    return "Use a JPEG, PNG or WebP image.";
  }
  if (file.size > AVATAR_RULES.maxBytes) {
    return `That photo is too large (max ${AVATAR_RULES.maxBytes / 1024 / 1024} MB).`;
  }
  return null;
}

/** Uploads and applies a new profile photo for the signed-in agent. */
export async function uploadAvatar(input: {
  agentId: string;
  token: string;
  file: File;
  onProgress?: (fraction: number) => void;
}): Promise<Agent> {
  const ticket = await api<UploadTicket>(`/api/agents/${input.agentId}/avatar/uploads`, {
    method: "POST",
    token: input.token,
    body: JSON.stringify({ mimeType: baseMimeType(input.file.type), size: input.file.size }),
  });
  await postToStorage(ticket, input.file, input.file.name, input.onProgress);
  return api<Agent>(`/api/agents/${input.agentId}/avatar`, {
    method: "PUT",
    token: input.token,
    body: JSON.stringify({ uploadToken: ticket.uploadToken }),
  });
}

export function removeAvatar(agentId: string, token: string): Promise<Agent> {
  return api<Agent>(`/api/agents/${agentId}/avatar`, { method: "DELETE", token });
}
