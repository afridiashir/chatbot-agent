/**
 * Demo data for local development.
 *
 * Deliberately minimal for now: one branch with one online agent, so every
 * chat from the widget lands on the same person and the flow is easy to follow
 * end to end.
 */

export interface SeedMessage {
  senderType: "VISITOR" | "AGENT";
  content: string;
}

export interface SeedVisitor {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface SeedConversation {
  visitorId: string;
  status: "ACTIVE" | "CLOSED";
  messages: SeedMessage[];
}

export interface SeedAgent {
  id: string;
  name: string;
  email: string;
  isOnline: boolean;
  conversations: SeedConversation[];
}

export interface SeedBranch {
  id: string;
  name: string;
  agents: SeedAgent[];
}

export const COMPANY = { id: "company_acme", name: "Acme Corp" };


export const VISITORS: SeedVisitor[] = [
  { id: "seed-visitor-khi-001", name: "Hina Siddiqui", email: "hina.siddiqui@example.com", phone: "+92 300 1234567" },
  { id: "seed-visitor-khi-002", name: "Rehan Aslam", email: "rehan.aslam@example.com", phone: "+92 301 2345678" },
  { id: "seed-visitor-khi-003", name: "Sadia Kamal", email: "sadia.kamal@example.com", phone: "+92 302 3456789" },
];

export const BRANCHES: SeedBranch[] = [
  {
    id: "branch_karachi",
    name: "Karachi",
    agents: [
      {
        id: "agent_ahmed_raza",
        name: "Ahmed Raza",
        email: "ahmed.raza@acme.example",
        isOnline: true,
        conversations: [
          {
            visitorId: "seed-visitor-khi-001",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "Hi, my last invoice looks wrong." },
              { senderType: "AGENT", content: "Happy to check — what is the invoice number?" },
              { senderType: "VISITOR", content: "INV-20418." },
            ],
          },
          {
            visitorId: "seed-visitor-khi-002",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "Do you deliver to DHA Phase 6?" },
              { senderType: "AGENT", content: "Yes, same-day within Karachi." },
            ],
          },
          {
            visitorId: "seed-visitor-khi-003",
            status: "CLOSED",
            messages: [
              { senderType: "VISITOR", content: "What are your opening hours?" },
              { senderType: "AGENT", content: "9am to 7pm, Monday to Saturday." },
              { senderType: "VISITOR", content: "Perfect, thanks." },
            ],
          },
        ],
      },
    ],
  },
];
