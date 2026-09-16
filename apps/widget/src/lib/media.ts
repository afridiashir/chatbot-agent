import { MEDIA_RULES, baseMimeType, type AttachmentKind, type UploadTicket } from "@repo/types";
import { ApiError, apiFetch } from "./api.js";

/** Same limits the API enforces for visitors, checked before uploading. */
export function checkVisitorFile(kind: AttachmentKind, file: Blob): string | null {
  const rules = MEDIA_RULES[kind];
  if (!rules.mimeTypes.includes(baseMimeType(file.type))) return "That file type can't be sent.";
  if (file.size > rules.maxBytes.VISITOR) {
    return `That file is too large (max ${Math.round(rules.maxBytes.VISITOR / 1024 / 1024)} MB).`;
  }
  return null;
}

/**
 * Asks the API for a one-shot upload form, posts the file straight to storage
 * with progress, and returns the token the message is sent with.
 */
export async function uploadVisitorAttachment(input: {
  apiUrl: string;
  conversationId: string;
  visitorId: string;
  kind: AttachmentKind;
  file: Blob;
  fileName: string;
  onProgress?: (fraction: number) => void;
}): Promise<string> {
  const mimeType = baseMimeType(input.file.type);
  const ticket = await apiFetch<UploadTicket>(
    input.apiUrl,
    `/api/conversations/${input.conversationId}/uploads`,
    {
      method: "POST",
      body: JSON.stringify({
        kind: input.kind,
        fileName: input.fileName,
        mimeType,
        size: input.file.size,
        visitorId: input.visitorId,
      }),
    },
  );

  const form = new FormData();
  for (const [key, value] of Object.entries(ticket.fields)) form.append(key, value);
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
        : reject(new ApiError("The file couldn't be uploaded", "UPLOAD_FAILED"));
    xhr.onerror = () =>
      reject(new ApiError("Upload failed, check your connection", "NETWORK_ERROR"));
    xhr.send(form);
  });

  return ticket.uploadToken;
}
