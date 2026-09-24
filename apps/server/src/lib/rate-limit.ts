import type { NextFunction, Request, Response } from "express";
import { tooMany } from "./http.js";

/**
 * A fixed window per caller, counted in memory.
 *
 * It exists for one endpoint: looking a person up by their phone number needs
 * no code and no account, so the only thing standing between a stranger and
 * somebody else's chats is knowing their number. That is the product's choice,
 * but it does not have to be cheap to guess at scale — a few attempts a minute
 * is plenty for a real visitor and useless for working through a range of
 * numbers.
 *
 * Deliberately not a dependency and not shared state: this process is the whole
 * API today. Behind more than one instance each would count its own callers, so
 * the real limit becomes the limit times the instances — which still bounds it,
 * and is the point at which this should move to Redis rather than grow here.
 */
export function rateLimit(options: { windowMs: number; max: number; message: string }) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  // Bounded by sweeping expired entries rather than by evicting: a caller that
  // has stopped calling stops occupying anything within one window.
  const sweep = (now: number) => {
    for (const [key, hit] of hits) if (hit.resetAt <= now) hits.delete(key);
  };

  return function limit(req: Request, res: Response, next: NextFunction): void {
    const now = Date.now();
    if (hits.size > 5000) sweep(now);

    // `req.ip` honours the proxy headers Express is configured to trust, which
    // behind Caddy is the visitor rather than the proxy.
    const key = req.ip ?? "unknown";
    const hit = hits.get(key);

    if (!hit || hit.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    hit.count += 1;
    if (hit.count > options.max) {
      res.setHeader("Retry-After", Math.ceil((hit.resetAt - now) / 1000));
      next(tooMany(options.message));
      return;
    }
    next();
  };
}
