// Shared view-model types for Echo. All data comes from the backend —
// there is no mock data in this app.

export type Presence = "online" | "away" | "offline";

export type MessageKind =
  | "text"
  | "image"
  | "voice"
  | "file"
  | "poll"
  | "voicemail"
  | "event"
  | "system";

export interface EchoProfile {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  pronouns: string | null;
  color: string;
  avatar: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  presence: Presence;
  lastSeen: string;
  joined: string;
}

export interface Reaction {
  emoji: string;
  count: number;
  mine: boolean;
}

export interface EchoMessage {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  authorInitials: string;
  authorAvatarUrl: string | null;
  kind: MessageKind;
  body: string;
  metadata: Record<string, unknown>;
  attachmentUrl: string | null;
  attachmentType: string | null;
  attachmentName: string | null;
  createdAt: string;
  time: string;
  edited: boolean;
  pinned: boolean;
  reactions: Reaction[];
  readByAll: boolean;
}

export interface EchoChat {
  id: string;
  kind: "dm" | "group";
  name: string;
  handle: string;
  avatar: string;
  avatarUrl: string | null;
  bannerUrl: string | null;
  color: string;
  members: number;
  memberIds: string[];
  description: string | null;
  presence?: Presence;
  otherUserId?: string;
  pinned: boolean;
  muted: boolean;
  archived: boolean;
  accepted: boolean;
  unread: number;
  lastActivity: string;
  lastMessage: string | null;
  lastMessageAt: string;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const min = Math.round(diff / 60000);
  if (min < 1) return "now";
  if (min < 60) return `${min}m`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "long", year: "numeric" });
}
