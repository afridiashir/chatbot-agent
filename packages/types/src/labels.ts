/**
 * Labels an agent or an admin puts on a conversation: "Follow up", "Sold",
 * "Refund". A chat can carry several at once.
 *
 * The set is managed by company admins rather than typed per chat, for the same
 * reason the city list is closed — "Sold", "sold" and "SOLD" are one thing to a
 * person and three things to a filter.
 */

/**
 * The name of the label every new conversation starts with. Seeded once per
 * company and marked `isSystem`, so it cannot be deleted out from under the
 * conversations that are about to be created.
 */
export const INITIAL_LABEL_NAME = "Initiated";

/**
 * A fixed palette rather than free hex. Every chip then reads as part of the
 * same interface in both themes, and an admin cannot pick white-on-white.
 */
export const LABEL_COLORS = [
  "grey",
  "green",
  "amber",
  "red",
  "blue",
  "purple",
  "teal",
  "pink",
] as const;
export type LabelColor = (typeof LABEL_COLORS)[number];

export interface Label {
  id: string;
  companyId: string;
  name: string;
  color: LabelColor;
  /**
   * True for "Initiated". It can be renamed and recoloured, but not deleted:
   * every new conversation is given it, so removing it would break chat
   * creation rather than merely tidying the list.
   */
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A label as it appears on a conversation — no company or timestamps needed. */
export type LabelRef = Pick<Label, "id" | "name" | "color">;

/** One label in the admin's list, with how many chats currently carry it. */
export interface LabelWithUsage extends Label {
  conversationCount: number;
}
