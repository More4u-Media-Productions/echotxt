export type Presence = "online" | "away" | "offline";

export interface EchoUser {
  id: string;
  username: string;
  displayName: string;
  avatar: string;
  color: string;
  bio: string;
  pronouns?: string;
  presence: Presence;
  lastSeen: string;
  mutuals: number;
  joined: string;
}

export type MessageKind =
  | "text"
  | "image"
  | "voice"
  | "file"
  | "poll"
  | "voicemail"
  | "event"
  | "system";

export interface Reaction {
  emoji: string;
  count: number;
  mine?: boolean;
}

export interface EchoMessage {
  id: string;
  authorId: string;
  kind: MessageKind;
  body: string;
  time: string;
  edited?: boolean;
  pinned?: boolean;
  replyTo?: { author: string; body: string };
  reactions?: Reaction[];
  status?: "sent" | "delivered" | "read";
  attachment?: { name: string; meta: string };
  duration?: string;
  transcript?: string;
  poll?: { question: string; options: { label: string; votes: number }[]; total: number };
}

export interface EchoChat {
  id: string;
  kind: "dm" | "group";
  name: string;
  handle: string;
  avatar: string;
  color: string;
  members?: number;
  description?: string;
  presence?: Presence;
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
  unread: number;
  typing?: boolean;
  draft?: string;
  lastActivity: string;
  messages: EchoMessage[];
}

export interface CallRecord {
  id: string;
  chatId: string;
  name: string;
  avatar: string;
  color: string;
  direction: "incoming" | "outgoing" | "missed";
  media: "voice" | "video";
  time: string;
  duration?: string;
  group?: boolean;
  voicemail?: { duration: string; transcript: string };
}

export interface ActivityItem {
  id: string;
  type:
    | "friend_request"
    | "mention"
    | "group_invite"
    | "missed_call"
    | "voicemail"
    | "poll"
    | "security";
  title: string;
  detail: string;
  time: string;
  unread?: boolean;
  actor?: string;
  color?: string;
  avatar?: string;
}

export const me: EchoUser = {
  id: "me",
  username: "@skyfox",
  displayName: "Sky Fox",
  avatar: "SF",
  color: "oklch(0.63 0.13 195)",
  bio: "Building quiet software. Tea before code.",
  pronouns: "they/them",
  presence: "online",
  lastSeen: "now",
  mutuals: 0,
  joined: "March 2024",
};

export const users: EchoUser[] = [
  {
    id: "u1",
    username: "@marlow",
    displayName: "Marlow Reid",
    avatar: "MR",
    color: "oklch(0.68 0.15 25)",
    bio: "Sound designer. Field recordings & long walks.",
    pronouns: "he/him",
    presence: "online",
    lastSeen: "now",
    mutuals: 12,
    joined: "Jan 2024",
  },
  {
    id: "u2",
    username: "@ivyquinn",
    displayName: "Ivy Quinn",
    avatar: "IQ",
    color: "oklch(0.7 0.14 145)",
    bio: "Botanist. Ask me about ferns.",
    presence: "away",
    lastSeen: "24m ago",
    mutuals: 8,
    joined: "Nov 2023",
  },
  {
    id: "u3",
    username: "@nine",
    displayName: "Nadia Ine",
    avatar: "NI",
    color: "oklch(0.72 0.13 85)",
    bio: "Photographer, night owl.",
    pronouns: "she/her",
    presence: "online",
    lastSeen: "now",
    mutuals: 21,
    joined: "Aug 2023",
  },
  {
    id: "u4",
    username: "@teodor",
    displayName: "Teodor Vance",
    avatar: "TV",
    color: "oklch(0.66 0.13 300)",
    bio: "Runs slow, ships fast.",
    presence: "offline",
    lastSeen: "yesterday",
    mutuals: 4,
    joined: "Feb 2025",
  },
  {
    id: "u5",
    username: "@harun",
    displayName: "Harun Ali",
    avatar: "HA",
    color: "oklch(0.7 0.13 240)",
    bio: "Coffee, chess, cinema.",
    presence: "online",
    lastSeen: "now",
    mutuals: 15,
    joined: "Jun 2024",
  },
  {
    id: "u6",
    username: "@rin",
    displayName: "Rin Takeda",
    avatar: "RT",
    color: "oklch(0.7 0.14 190)",
    bio: "Illustrator. Commissions closed.",
    presence: "away",
    lastSeen: "1h ago",
    mutuals: 6,
    joined: "Dec 2024",
  },
];

export const suggestedFriends: EchoUser[] = [
  {
    id: "s1",
    username: "@oleander",
    displayName: "Ola Pike",
    avatar: "OP",
    color: "oklch(0.7 0.13 60)",
    bio: "Cartographer of small places.",
    presence: "offline",
    lastSeen: "3d ago",
    mutuals: 5,
    joined: "Apr 2025",
  },
  {
    id: "s2",
    username: "@brookes",
    displayName: "Brooke Sato",
    avatar: "BS",
    color: "oklch(0.68 0.14 330)",
    bio: "Runs the Thursday film club.",
    presence: "online",
    lastSeen: "now",
    mutuals: 9,
    joined: "Feb 2026",
  },
];

export const friendRequests = [
  { id: "fr1", user: users[5]!, note: "We met at the print fair 👋", time: "2h" },
  { id: "fr2", user: suggestedFriends[1]!, note: "Film club roster", time: "1d" },
];

export const blockedUsers = [
  { id: "b1", username: "@dealsdaily", displayName: "Daily Deals", reason: "Spam", time: "Jan 12" },
];

export const messageRequests = [
  {
    id: "mr1",
    from: "@lumen_studio",
    displayName: "Lumen Studio",
    avatar: "LS",
    color: "oklch(0.7 0.12 110)",
    preview: "Hi! We loved your set at the co-op — could we talk about a collab?",
    time: "3h",
    mutuals: 2,
  },
  {
    id: "mr2",
    from: "@petra.k",
    displayName: "Petra Kovac",
    avatar: "PK",
    color: "oklch(0.68 0.13 15)",
    preview: "Is this the right Sky from the archive project?",
    time: "yesterday",
    mutuals: 0,
  },
];

export const chats: EchoChat[] = [
  {
    id: "c1",
    kind: "dm",
    name: "Marlow Reid",
    handle: "@marlow",
    avatar: "MR",
    color: "oklch(0.68 0.15 25)",
    presence: "online",
    pinned: true,
    unread: 2,
    typing: true,
    lastActivity: "now",
    messages: [
      {
        id: "m1",
        authorId: "u1",
        kind: "text",
        body: "Did the rain recording survive the upload?",
        time: "18:02",
      },
      {
        id: "m2",
        authorId: "me",
        kind: "text",
        body: "It did. Cleaned the low end too — sounds like a proper storm now.",
        time: "18:04",
        status: "read",
      },
      {
        id: "m3",
        authorId: "u1",
        kind: "voice",
        body: "Voice message",
        time: "18:06",
        duration: "0:34",
        transcript: "Play it at half speed, the thunder tail is gorgeous.",
      },
      {
        id: "m4",
        authorId: "me",
        kind: "text",
        body: "Half speed is unreal. Adding it to the closing scene.",
        time: "18:09",
        reactions: [{ emoji: "🔥", count: 2, mine: true }],
        status: "read",
      },
      {
        id: "m5",
        authorId: "u1",
        kind: "file",
        body: "storm-master-v3.wav",
        time: "18:11",
        attachment: { name: "storm-master-v3.wav", meta: "WAV · 48 kHz · 82 MB" },
      },
      {
        id: "m6",
        authorId: "u1",
        kind: "text",
        body: "Call later to mix? I'm free after 8.",
        time: "18:12",
        replyTo: { author: "Sky Fox", body: "Adding it to the closing scene." },
      },
    ],
  },
  {
    id: "c2",
    kind: "group",
    name: "Cabin Trip 🏔️",
    handle: "6 members",
    avatar: "CT",
    color: "oklch(0.7 0.14 145)",
    members: 6,
    description: "Three nights, no signal, one very ambitious chili plan.",
    pinned: true,
    unread: 5,
    lastActivity: "12m",
    messages: [
      {
        id: "g1",
        authorId: "u2",
        kind: "text",
        body: "Booking closes Friday — final count?",
        time: "16:40",
        pinned: true,
      },
      {
        id: "g2",
        authorId: "u3",
        kind: "poll",
        body: "Poll",
        time: "16:44",
        poll: {
          question: "Which weekend works?",
          options: [
            { label: "Aug 14–16", votes: 4 },
            { label: "Aug 21–23", votes: 2 },
            { label: "Either works", votes: 1 },
          ],
          total: 7,
        },
      },
      {
        id: "g3",
        authorId: "u5",
        kind: "text",
        body: "I can drive four people if we leave early.",
        time: "17:02",
        reactions: [
          { emoji: "🙌", count: 3 },
          { emoji: "🚗", count: 1, mine: true },
        ],
      },
      {
        id: "g4",
        authorId: "me",
        kind: "text",
        body: "Adding the grocery list to shared files tonight.",
        time: "17:20",
        status: "delivered",
      },
      {
        id: "g5",
        authorId: "u2",
        kind: "event",
        body: "Cabin departure",
        time: "17:31",
        attachment: { name: "Fri, Aug 14 · 07:00", meta: "Meeting point: Northgate lot" },
      },
    ],
  },
  {
    id: "c3",
    kind: "dm",
    name: "Nadia Ine",
    handle: "@nine",
    avatar: "NI",
    color: "oklch(0.72 0.13 85)",
    presence: "online",
    unread: 0,
    draft: "Sending the contact sheet in",
    lastActivity: "1h",
    messages: [
      {
        id: "n1",
        authorId: "u3",
        kind: "image",
        body: "Rooftop, 6am",
        time: "07:12",
        attachment: { name: "rooftop-6am.jpg", meta: "Image · 3.2 MB" },
      },
      {
        id: "n2",
        authorId: "me",
        kind: "text",
        body: "The fog line is perfect. Print it big.",
        time: "08:01",
        status: "read",
      },
      {
        id: "n3",
        authorId: "u3",
        kind: "text",
        body: "Booked the darkroom for Sunday.",
        time: "08:05",
        edited: true,
      },
    ],
  },
  {
    id: "c4",
    kind: "dm",
    name: "Harun Ali",
    handle: "@harun",
    avatar: "HA",
    color: "oklch(0.7 0.13 240)",
    presence: "online",
    unread: 1,
    muted: true,
    lastActivity: "3h",
    messages: [
      {
        id: "h1",
        authorId: "u5",
        kind: "voicemail",
        body: "Voicemail",
        time: "15:44",
        duration: "0:22",
        transcript: "Missed you — call back whenever, nothing urgent. Chess later?",
      },
      { id: "h2", authorId: "u5", kind: "text", body: "Or Thursday works too.", time: "15:45" },
    ],
  },
  {
    id: "c5",
    kind: "group",
    name: "Print Club",
    handle: "11 members",
    avatar: "PC",
    color: "oklch(0.66 0.13 300)",
    members: 11,
    description: "Risograph experiments and paper hoarding.",
    unread: 0,
    lastActivity: "yesterday",
    messages: [
      {
        id: "p1",
        authorId: "u6",
        kind: "text",
        body: "New blue ink arrived, it's louder than expected.",
        time: "20:10",
      },
      {
        id: "p2",
        authorId: "me",
        kind: "text",
        body: "Louder is the point 🎯",
        time: "20:14",
        status: "read",
      },
    ],
  },
  {
    id: "c6",
    kind: "dm",
    name: "Teodor Vance",
    handle: "@teodor",
    avatar: "TV",
    color: "oklch(0.66 0.13 300)",
    presence: "offline",
    archived: true,
    unread: 0,
    lastActivity: "Jun 2",
    messages: [
      { id: "t1", authorId: "u4", kind: "text", body: "Thanks again for the loan!", time: "11:02" },
    ],
  },
];

export const calls: CallRecord[] = [
  {
    id: "call1",
    chatId: "c1",
    name: "Marlow Reid",
    avatar: "MR",
    color: "oklch(0.68 0.15 25)",
    direction: "outgoing",
    media: "video",
    time: "Today · 18:20",
    duration: "42m 11s",
  },
  {
    id: "call2",
    chatId: "c4",
    name: "Harun Ali",
    avatar: "HA",
    color: "oklch(0.7 0.13 240)",
    direction: "missed",
    media: "voice",
    time: "Today · 15:44",
    voicemail: {
      duration: "0:22",
      transcript: "Missed you — call back whenever, nothing urgent. Chess later?",
    },
  },
  {
    id: "call3",
    chatId: "c2",
    name: "Cabin Trip 🏔️",
    avatar: "CT",
    color: "oklch(0.7 0.14 145)",
    direction: "incoming",
    media: "voice",
    time: "Yesterday · 21:03",
    duration: "8m 02s",
    group: true,
  },
  {
    id: "call4",
    chatId: "c3",
    name: "Nadia Ine",
    avatar: "NI",
    color: "oklch(0.72 0.13 85)",
    direction: "incoming",
    media: "video",
    time: "Yesterday · 09:15",
    duration: "17m 40s",
  },
  {
    id: "call5",
    chatId: "c5",
    name: "Print Club",
    avatar: "PC",
    color: "oklch(0.66 0.13 300)",
    direction: "missed",
    media: "video",
    time: "Mon · 19:30",
    group: true,
  },
];

export const activity: ActivityItem[] = [
  {
    id: "a1",
    type: "friend_request",
    title: "Rin Takeda sent a friend request",
    detail: "“We met at the print fair 👋”",
    time: "2h",
    unread: true,
    actor: "RT",
    color: "oklch(0.7 0.14 190)",
  },
  {
    id: "a2",
    type: "mention",
    title: "Ivy mentioned you in Cabin Trip 🏔️",
    detail: "“@skyfox can you bring the pour-over kit?”",
    time: "3h",
    unread: true,
    actor: "IQ",
    color: "oklch(0.7 0.14 145)",
  },
  {
    id: "a3",
    type: "voicemail",
    title: "New voicemail from Harun Ali",
    detail: "0:22 · transcript available",
    time: "4h",
    unread: true,
    actor: "HA",
    color: "oklch(0.7 0.13 240)",
  },
  {
    id: "a4",
    type: "missed_call",
    title: "Missed video call in Print Club",
    detail: "3 people were on the call",
    time: "Mon",
    actor: "PC",
    color: "oklch(0.66 0.13 300)",
  },
  {
    id: "a5",
    type: "poll",
    title: "Poll closed: Which weekend works?",
    detail: "Aug 14–16 won with 4 of 7 votes",
    time: "Mon",
    actor: "CT",
    color: "oklch(0.7 0.14 145)",
  },
  {
    id: "a6",
    type: "group_invite",
    title: "Nadia invited you to Darkroom Sundays",
    detail: "4 mutual friends are members",
    time: "Sun",
    actor: "NI",
    color: "oklch(0.72 0.13 85)",
  },
  {
    id: "a7",
    type: "security",
    title: "New sign-in on Echo for Desktop",
    detail: "Lisbon, PT · Chrome on macOS",
    time: "Sun",
    actor: "🔒",
    color: "oklch(0.79 0.14 75)",
  },
];

export const devices = [
  { id: "d1", name: "iPhone 15", detail: "This device · Lisbon, PT", active: true, last: "now" },
  { id: "d2", name: "Echo for macOS", detail: "MacBook Pro · Lisbon, PT", last: "2h ago" },
  { id: "d3", name: "Echo Web", detail: "Firefox · Porto, PT", last: "3d ago" },
];

export const storageBreakdown = [
  { label: "Photos & video", value: 4.2, tone: "oklch(0.63 0.13 195)" },
  { label: "Voice messages", value: 1.1, tone: "oklch(0.7 0.14 145)" },
  { label: "Documents", value: 0.8, tone: "oklch(0.72 0.13 85)" },
  { label: "Other", value: 0.4, tone: "oklch(0.66 0.13 300)" },
];

export function findChat(id: string) {
  return chats.find((c) => c.id === id);
}

export function authorOf(id: string) {
  if (id === "me") return me;
  return users.find((u) => u.id === id) ?? me;
}
