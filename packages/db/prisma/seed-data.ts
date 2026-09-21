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
  phone: string;
  maritalStatus: "SINGLE" | "MARRIED" | "DIVORCED" | "SEPARATED" | "WIDOWED";
  city: string;
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
  {
    id: "seed-visitor-khi-001",
    name: "Hina Siddiqui",
    phone: "+92 300 1234567",
    maritalStatus: "MARRIED",
    city: "Karachi",
  },
  {
    id: "seed-visitor-khi-002",
    name: "Rehan Aslam",
    phone: "+92 301 2345678",
    maritalStatus: "SINGLE",
    city: "Hyderabad",
  },
  {
    id: "seed-visitor-khi-003",
    name: "Sadia Kamal",
    phone: "+92 302 3456789",
    maritalStatus: "WIDOWED",
    city: "Lahore",
  },
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
      // Bilal, Usman and Hamza carry no seeded conversations. `check:routing`
      // and `check:flow` set each one's load explicitly before asserting who a
      // visitor is routed to, so any preset load here would fight the tests.
      {
        id: "agent_bilal_khan",
        name: "Bilal Khan",
        email: "bilal.khan@acme.example",
        isOnline: true,
        conversations: [],
      },
      {
        id: "agent_usman_sheikh",
        name: "Usman Sheikh",
        email: "usman.sheikh@acme.example",
        isOnline: false,
        conversations: [],
      },
      {
        id: "agent_hamza_iqbal",
        name: "Hamza Iqbal",
        email: "hamza.iqbal@acme.example",
        isOnline: true,
        conversations: [],
      },
    ],
  },
  {
    // Seeded entirely offline, on purpose: it is how `check:admin` exercises
    // the "nobody was available, but record the lead anyway" path.
    id: "branch_peshawar",
    name: "Peshawar",
    agents: [
      {
        id: "agent_sana_gul",
        name: "Sana Gul",
        email: "sana.gul@acme.example",
        isOnline: false,
        conversations: [],
      },
    ],
  },
];
