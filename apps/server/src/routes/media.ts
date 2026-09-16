import { Router } from "express";
import { z } from "zod";
import { idSchema } from "@repo/validation";
import { asyncHandler } from "../lib/async-handler.js";
import { parseOrThrow } from "../lib/validate.js";
import { resolveMedia } from "../services/media.js";

export const mediaRouter: Router = Router();

/**
 * GET /api/media/:attachmentId?sig= — follows a signed media link to a
 * short-lived storage URL. A redirect rather than a proxy, so video seeking
 * (range requests) is served by storage directly.
 */
mediaRouter.get(
  "/:attachmentId",
  asyncHandler(async (req, res) => {
    const { attachmentId } = parseOrThrow(
      z.object({ attachmentId: idSchema }),
      req.params,
      "media id",
    );
    const { sig } = parseOrThrow(z.object({ sig: z.string().min(1) }), req.query, "query");
    const url = await resolveMedia(attachmentId, sig);
    res.setHeader("Cache-Control", "private, no-store");
    res.redirect(302, url);
  }),
);
