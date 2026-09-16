import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../env.js";

/** Lifetime of the signed media link inside a message payload. */
const MEDIA_LINK_TTL = "12h";

/**
 * Media tokens are signed with the session secret but carry `typ: "media"` and
 * no `role`, so they can never pass as a session token, and vice versa.
 */
export const mediaClaims = z.object({ typ: z.literal("media"), aid: z.string() });

/**
 * The path clients put in `src`. Signed rather than session-authenticated,
 * because `<img>` and `<video>` cannot send an Authorization header; it is only
 * ever handed out inside a message the recipient was allowed to read. Kept
 * synchronous so message serialisation stays synchronous.
 */
export function mediaPath(attachmentId: string): string {
  const sig = jwt.sign(
    { typ: "media", aid: attachmentId } satisfies z.infer<typeof mediaClaims>,
    env.JWT_SECRET,
    { expiresIn: MEDIA_LINK_TTL },
  );
  return `/api/media/${attachmentId}?sig=${encodeURIComponent(sig)}`;
}
