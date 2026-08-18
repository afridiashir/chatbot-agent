export * from "./client.js";
export * from "./password.js";

// Row types, re-exported so apps can talk about persisted shapes without
// reaching into the generated output directory.
export type {
  Admin as AdminRow,
  Agent as AgentRow,
  Branch as BranchRow,
  Company as CompanyRow,
  Enquiry as EnquiryRow,
  Lead as LeadRow,
  Conversation as ConversationRow,
  Message as MessageRow,
  Visitor as VisitorRow,
} from "../generated/prisma/client.js";

export { Prisma } from "../generated/prisma/client.js";
