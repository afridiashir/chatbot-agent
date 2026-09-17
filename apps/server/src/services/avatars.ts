import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "@repo/db";
import { AVATAR_RULES, baseMimeType, type Agent, type UploadTicket } from "@repo/types";
import { env } from "../env.js";
import type { AdminTokenPayload, AgentTokenPayload } from "../lib/auth.js";
import { forbidden, HttpError, notFound } from "../lib/http.js";
import { toAgent } from "../lib/serialize.js";
import {
  createUploadForm,
  deleteObject,
  headObject,
  presignDownload,
  readObjectPrefix,
} from "../lib/storage.js";
import { looksLike } from "./media.js";

const invalid = (message: string) =>
  new HttpError(400, "VALIDATION_ERROR", message, { avatar: [message] });

const avatarUploadClaims = z.object({
  typ: z.literal("avatar-upload"),
  agentId: z.string(),
  key: z.string(),
  mimeType: z.string(),
});

/**
 * Who is changing the photo: the agent themselves, or an admin managing them.
 * A company admin may change any agent in their company; a branch admin only
 * agents in their own branch. Anyone else's agent reads as not found.
 */
export type AvatarActor =
  | { kind: "agent"; agent: AgentTokenPayload }
  | { kind: "admin"; admin: AdminTokenPayload };

async function assertCanEdit(agentId: string, actor: AvatarActor): Promise<void> {
  if (actor.kind === "agent") {
    if (actor.agent.agentId !== agentId) throw forbidden("You can only change your own photo");
    return;
  }
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { branchId: true, branch: { select: { companyId: true } } },
  });
  const { admin } = actor;
  if (
    !agent ||
    agent.branch.companyId !== admin.companyId ||
    (admin.branchId !== null && agent.branchId !== admin.branchId)
  ) {
    throw notFound("Agent not found");
  }
}

/** Grants a single photo upload for one agent's profile picture. */
export async function createAvatarUpload(
  agentId: string,
  input: { mimeType: string; size: number },
  actor: AvatarActor,
): Promise<UploadTicket> {
  await assertCanEdit(agentId, actor);

  const mimeType = baseMimeType(input.mimeType);
  if (!AVATAR_RULES.mimeTypes.includes(mimeType)) {
    throw invalid("Use a JPEG, PNG or WebP image");
  }
  if (input.size > AVATAR_RULES.maxBytes) {
    throw invalid(`Photo is too large (max ${AVATAR_RULES.maxBytes / 1024 / 1024} MB)`);
  }

  const extension = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
  // The random part doubles as the photo's version, so a new photo gets a new
  // URL and nobody sees a cached old one.
  const key = `avatars/${agentId}/${randomUUID()}.${extension}`;
  const form = await createUploadForm({
    key,
    contentType: mimeType,
    maxBytes: AVATAR_RULES.maxBytes,
    expiresSeconds: 5 * 60,
  });

  const uploadToken = jwt.sign(
    { typ: "avatar-upload", agentId, key, mimeType } satisfies z.infer<typeof avatarUploadClaims>,
    env.JWT_SECRET,
    { expiresIn: "30m" },
  );
  return { url: form.url, fields: form.fields, uploadToken, maxBytes: AVATAR_RULES.maxBytes };
}

/**
 * Makes an uploaded photo the agent's profile picture, after checking it is
 * really an image of the granted type, and removes the one it replaces.
 */
export async function setAvatar(
  agentId: string,
  uploadToken: string,
  actor: AvatarActor,
): Promise<Agent> {
  await assertCanEdit(agentId, actor);

  let claims: z.infer<typeof avatarUploadClaims>;
  try {
    claims = avatarUploadClaims.parse(jwt.verify(uploadToken, env.JWT_SECRET));
  } catch {
    throw invalid("The upload expired. Please choose the photo again.");
  }
  if (claims.agentId !== agentId) throw invalid("That upload belongs to someone else.");

  const head = await headObject(claims.key);
  if (!head) throw invalid("The photo has not finished uploading.");
  if (head.size <= 0 || head.size > AVATAR_RULES.maxBytes) {
    await deleteObject(claims.key);
    throw invalid("The photo is empty or too large.");
  }
  if (!looksLike(claims.mimeType, await readObjectPrefix(claims.key, 16))) {
    await deleteObject(claims.key);
    throw invalid("That file isn't a valid image.");
  }

  const previous = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { avatarKey: true },
  });
  if (!previous) throw notFound("Agent not found");

  const agent = await prisma.agent.update({
    where: { id: agentId },
    data: { avatarKey: claims.key },
  });
  if (previous.avatarKey && previous.avatarKey !== claims.key) {
    await deleteObject(previous.avatarKey);
  }
  return toAgent(agent);
}

export async function removeAvatar(agentId: string, actor: AvatarActor): Promise<Agent> {
  await assertCanEdit(agentId, actor);
  const previous = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { avatarKey: true },
  });
  if (!previous) throw notFound("Agent not found");

  const agent = await prisma.agent.update({ where: { id: agentId }, data: { avatarKey: null } });
  if (previous.avatarKey) await deleteObject(previous.avatarKey);
  return toAgent(agent);
}

/** The chats a visitor currently has open with this agent, to refresh their header. */
export async function openConversationIds(agentId: string): Promise<string[]> {
  const rows = await prisma.conversation.findMany({
    where: { agentId, status: "ACTIVE" },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}

/**
 * Where a profile photo actually lives. Photos are shown to anonymous website
 * visitors, so this is deliberately unauthenticated; the version in the path
 * must match the current photo, so an old or guessed URL resolves to nothing.
 */
export async function resolveAvatar(agentId: string, version: string): Promise<string> {
  const agent = await prisma.agent.findUnique({
    where: { id: agentId },
    select: { avatarKey: true, isActive: true },
  });
  const key = agent?.avatarKey;
  if (!agent || !agent.isActive || !key || !key.includes(`/${version}.`)) {
    throw notFound("Photo not found");
  }
  const mimeType = key.endsWith(".png")
    ? "image/png"
    : key.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
  return presignDownload({
    key,
    contentType: mimeType,
    fileName: `agent-${agentId}`,
    expiresSeconds: 60 * 60,
  });
}
