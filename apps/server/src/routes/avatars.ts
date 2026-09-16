import { Router } from "express";
import { z } from "zod";
import { idSchema } from "@repo/validation";
import { asyncHandler } from "../lib/async-handler.js";
import { parseOrThrow } from "../lib/validate.js";
import { resolveAvatar } from "../services/avatars.js";

export const avatarsRouter: Router = Router();

/**
 * GET /api/avatars/:agentId/:version — an agent's profile photo. Public, since
 * website visitors see it, and redirects to storage. The versioned path is
 * cacheable; a new photo gets a new version.
 */
avatarsRouter.get(
  "/:agentId/:version",
  asyncHandler(async (req, res) => {
    const { agentId, version } = parseOrThrow(
      z.object({ agentId: idSchema, version: z.string().regex(/^[0-9a-f-]{36}$/) }),
      req.params,
      "photo",
    );
    const url = await resolveAvatar(agentId, version);
    // The redirect target expires in an hour, so the redirect itself may not
    // outlive it in a cache.
    res.setHeader("Cache-Control", "public, max-age=1800");
    res.redirect(302, url);
  }),
);
