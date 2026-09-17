import type { Message, MessageQuote } from "@repo/types";

const MEDIA_LABEL: Record<string, string> = {
  IMAGE: "Photo",
  VIDEO: "Video",
  AUDIO: "Audio",
  VOICE: "Voice message",
};

/** What a quoted message reads as: its text, or the kind of media it carried. */
export function quoteText(quote: MessageQuote): string {
  if (quote.content) return quote.content;
  return quote.attachmentKind ? (MEDIA_LABEL[quote.attachmentKind] ?? "Attachment") : "Message";
}

/** The quote a message would become when replied to. */
export function toQuote(message: Message): MessageQuote {
  return {
    id: message.id,
    senderType: message.senderType,
    content: message.content,
    attachmentKind: message.attachment?.kind ?? null,
  };
}
