/**
 * Demo data for local development.
 *
 * The Karachi branch deliberately mirrors the worked example in the spec so the
 * routing rule can be eyeballed straight after seeding:
 *   Ahmed online/2, Bilal online/1, Usman offline, Hamza online/3 -> Bilal wins.
 *
 * Peshawar is seeded entirely offline so the "no agents available" path is easy
 * to exercise without editing the database by hand.
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
  { id: "seed-visitor-khi-004", name: "Faisal Mirza", email: "faisal.mirza@example.com", phone: "+92 303 4567890" },
  { id: "seed-visitor-khi-005", name: "Nadia Butt", email: "nadia.butt@example.com", phone: "+92 304 5678901" },
  { id: "seed-visitor-khi-006", name: "Junaid Ali", email: "junaid.ali@example.com", phone: "+92 305 6789012" },
  { id: "seed-visitor-khi-007", name: "Rabia Zafar", email: "rabia.zafar@example.com", phone: "+92 306 7890123" },
  { id: "seed-visitor-lhr-001", name: "Adnan Sheikh", email: "adnan.sheikh@example.com", phone: "+92 321 1234567" },
  { id: "seed-visitor-lhr-002", name: "Mehwish Anwar", email: "mehwish.anwar@example.com", phone: "+92 322 2345678" },
  { id: "seed-visitor-lhr-003", name: "Talha Rashid", email: "talha.rashid@example.com", phone: "+92 323 3456789" },
  { id: "seed-visitor-lhr-004", name: "Iqra Nawaz", email: "iqra.nawaz@example.com", phone: "+92 324 4567890" },
  { id: "seed-visitor-isb-001", name: "Waleed Abbas", email: "waleed.abbas@example.com", phone: "+92 331 1234567" },
  { id: "seed-visitor-isb-002", name: "Komal Riaz", email: "komal.riaz@example.com", phone: "+92 332 2345678" },
  { id: "seed-visitor-psw-001", name: "Shahid Khan", email: "shahid.khan@example.com", phone: "+92 341 1234567" },
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
      {
        id: "agent_bilal_khan",
        name: "Bilal Khan",
        email: "bilal.khan@acme.example",
        isOnline: true,
        conversations: [
          {
            visitorId: "seed-visitor-khi-004",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "I need to change my delivery address." },
              { senderType: "AGENT", content: "Sure — has the order shipped yet?" },
            ],
          },
        ],
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
        conversations: [
          {
            visitorId: "seed-visitor-khi-005",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "The tracking link is not loading." },
              { senderType: "AGENT", content: "Let me pull it up for you." },
            ],
          },
          {
            visitorId: "seed-visitor-khi-006",
            status: "ACTIVE",
            messages: [{ senderType: "VISITOR", content: "Is the annual plan refundable?" }],
          },
          {
            visitorId: "seed-visitor-khi-007",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "Can I add a second user to my account?" },
              { senderType: "AGENT", content: "Yes, up to five on your current plan." },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "branch_lahore",
    name: "Lahore",
    agents: [
      {
        id: "agent_fatima_malik",
        name: "Fatima Malik",
        email: "fatima.malik@acme.example",
        isOnline: true,
        conversations: [
          {
            visitorId: "seed-visitor-lhr-001",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "Hello, I would like a quote for 50 units." },
              { senderType: "AGENT", content: "Of course. Which product line?" },
            ],
          },
        ],
      },
      {
        id: "agent_zainab_ali",
        name: "Zainab Ali",
        email: "zainab.ali@acme.example",
        isOnline: true,
        conversations: [],
      },
      {
        id: "agent_omar_farooq",
        name: "Omar Farooq",
        email: "omar.farooq@acme.example",
        isOnline: false,
        conversations: [
          {
            visitorId: "seed-visitor-lhr-002",
            status: "CLOSED",
            messages: [
              { senderType: "VISITOR", content: "Do you have a Gulberg outlet?" },
              { senderType: "AGENT", content: "We do — Main Boulevard, next to the bank." },
            ],
          },
        ],
      },
      {
        id: "agent_saad_mehmood",
        name: "Saad Mehmood",
        email: "saad.mehmood@acme.example",
        isOnline: true,
        conversations: [
          {
            visitorId: "seed-visitor-lhr-003",
            status: "ACTIVE",
            messages: [{ senderType: "VISITOR", content: "My promo code was rejected." }],
          },
          {
            visitorId: "seed-visitor-lhr-004",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "Can I pay on delivery?" },
              { senderType: "AGENT", content: "Yes, cash or card on delivery." },
            ],
          },
        ],
      },
      {
        id: "agent_ayesha_noor",
        name: "Ayesha Noor",
        email: "ayesha.noor@acme.example",
        isOnline: false,
        conversations: [],
      },
    ],
  },
  {
    id: "branch_islamabad",
    name: "Islamabad",
    agents: [
      {
        id: "agent_hassan_tariq",
        name: "Hassan Tariq",
        email: "hassan.tariq@acme.example",
        isOnline: true,
        conversations: [
          {
            visitorId: "seed-visitor-isb-001",
            status: "ACTIVE",
            messages: [
              { senderType: "VISITOR", content: "I want to upgrade my subscription." },
              { senderType: "AGENT", content: "Great — I can do that right now." },
            ],
          },
        ],
      },
      {
        id: "agent_maryam_javed",
        name: "Maryam Javed",
        email: "maryam.javed@acme.example",
        isOnline: false,
        conversations: [],
      },
      {
        id: "agent_danish_qureshi",
        name: "Danish Qureshi",
        email: "danish.qureshi@acme.example",
        isOnline: true,
        conversations: [],
      },
      {
        id: "agent_sana_rauf",
        name: "Sana Rauf",
        email: "sana.rauf@acme.example",
        isOnline: true,
        conversations: [
          {
            visitorId: "seed-visitor-isb-002",
            status: "CLOSED",
            messages: [{ senderType: "VISITOR", content: "Never mind, I found it." }],
          },
        ],
      },
    ],
  },
  {
    id: "branch_peshawar",
    name: "Peshawar",
    agents: [
      {
        id: "agent_imran_gul",
        name: "Imran Gul",
        email: "imran.gul@acme.example",
        isOnline: false,
        conversations: [],
      },
      {
        id: "agent_yasir_shah",
        name: "Yasir Shah",
        email: "yasir.shah@acme.example",
        isOnline: false,
        conversations: [],
      },
      {
        id: "agent_kamran_afridi",
        name: "Kamran Afridi",
        email: "kamran.afridi@acme.example",
        isOnline: false,
        conversations: [],
      },
      {
        id: "agent_noor_khattak",
        name: "Noor Khattak",
        email: "noor.khattak@acme.example",
        isOnline: false,
        conversations: [
          {
            visitorId: "seed-visitor-psw-001",
            status: "CLOSED",
            messages: [
              { senderType: "VISITOR", content: "Are you open on Sunday?" },
              { senderType: "AGENT", content: "Sundays we are closed." },
            ],
          },
        ],
      },
    ],
  },
];
