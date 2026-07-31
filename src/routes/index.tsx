import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Archive,
  Inbox,
  MessageCirclePlus,
  MessageSquare,
  Pin,
  Filter,
  Check,
  X,
  ShieldBan,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, SearchField } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { Conversation } from "@/components/echo/conversation";
import { chats, messageRequests, type EchoChat } from "@/lib/echo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Echo — Private messaging without a phone number" },
      {
        name: "description",
        content:
          "Echo is a private messaging app built on usernames: direct messages, powerful groups, calls, voicemail and granular privacy controls.",
      },
      { property: "og:title", content: "Echo — Private messaging without a phone number" },
      {
        property: "og:description",
        content:
          "Chats, friends, calls, activity and profile — one polished messaging app built around conversations, not feeds.",
      },
    ],
  }),
  component: ChatsPage,
});

type Tab = "all" | "unread" | "requests" | "archived";

function ChatsPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [activeId, setActiveId] = useState<string>("c1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [requests, setRequests] = useState(messageRequests);

  const list = useMemo(() => {
    const base = chats.filter((c) => (tab === "archived" ? c.archived : !c.archived));
    const filtered = tab === "unread" ? base.filter((c) => c.unread > 0) : base;
    const q = query.trim().toLowerCase();
    const searched = q
      ? filtered.filter(
          (c) => c.name.toLowerCase().includes(q) || c.handle.toLowerCase().includes(q),
        )
      : filtered;
    return [...searched].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }, [query, tab]);

  const active = chats.find((c) => c.id === activeId) ?? chats[0]!;
  const unreadTotal = chats.reduce((n, c) => n + (c.archived ? 0 : c.unread), 0);

  const open = (id: string) => {
    setActiveId(id);
    setMobileOpen(true);
  };

  return (
    <AppShell
      title="Chats"
      subtitle={`${unreadTotal} unread · ${requests.length} message requests`}
      contentClassName="lg:h-[calc(100vh-69px)] lg:overflow-hidden"
      actions={
        <button
          onClick={() => toast("New conversation", { description: "Pick a friend or group" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <MessageCirclePlus className="h-4 w-4" />
          <span className="hidden sm:inline">New</span>
        </button>
      }
    >
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(320px,380px)_1fr]">
        <div
          className={cn(
            "scroll-slim min-h-0 overflow-y-auto border-r border-border px-3 py-3 sm:px-4",
            mobileOpen && "hidden lg:block",
          )}
        >
          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search chats, people, messages"
          />

          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ["all", "All", Filter],
                ["unread", "Unread", MessageSquare],
                ["requests", `Requests`, Inbox],
                ["archived", "Archived", Archive],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  tab === key
                    ? "border-primary/40 bg-primary/15 text-foreground"
                    : "border-border bg-surface text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
                {key === "requests" && requests.length ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                    {requests.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === "requests" ? (
            <div className="mt-4 space-y-3">
              <p className="px-1 text-xs text-muted-foreground">
                People who aren't friends land here first. Nothing is marked as read until you
                accept.
              </p>
              {requests.length === 0 ? (
                <EmptyState
                  icon={Inbox}
                  title="No message requests"
                  detail="When someone outside your friends list messages you, it will wait here."
                />
              ) : (
                requests.map((r) => (
                  <article
                    key={r.id}
                    className="animate-pop rounded-3xl border border-border bg-surface p-4 shadow-soft"
                  >
                    <div className="flex items-start gap-3">
                      <EchoAvatar initials={r.avatar} color={r.color} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{r.displayName}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.from} · {r.mutuals} mutual friends · {r.time}
                        </p>
                        <p className="mt-2 text-sm text-foreground/90">{r.preview}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => {
                          setRequests((p) => p.filter((x) => x.id !== r.id));
                          toast("Request accepted", { description: `${r.from} moved to Chats` });
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground"
                      >
                        <Check className="h-4 w-4" /> Accept
                      </button>
                      <button
                        onClick={() => {
                          setRequests((p) => p.filter((x) => x.id !== r.id));
                          toast("Request declined");
                        }}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border border-border py-2 text-sm font-medium"
                      >
                        <X className="h-4 w-4" /> Decline
                      </button>
                      <button
                        onClick={() => {
                          setRequests((p) => p.filter((x) => x.id !== r.id));
                          toast("User blocked");
                        }}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-destructive"
                        aria-label="Block"
                      >
                        <ShieldBan className="h-4 w-4" />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : list.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="Nothing here yet"
              detail={
                tab === "archived"
                  ? "Archived conversations stay out of your way until someone replies."
                  : "You're all caught up. Start a conversation with a friend."
              }
            />
          ) : (
            <div className="mt-3 space-y-1">
              {list.map((chat) => (
                <ChatRow
                  key={chat.id}
                  chat={chat}
                  active={chat.id === activeId}
                  onClick={() => open(chat.id)}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className={cn(
            "min-h-0 lg:block lg:h-full",
            mobileOpen ? "fixed inset-0 z-40 bg-background lg:static" : "hidden",
          )}
        >
          <Conversation chat={active} onBack={() => setMobileOpen(false)} />
        </div>
      </div>
    </AppShell>
  );
}

function ChatRow({
  chat,
  active,
  onClick,
}: {
  chat: EchoChat;
  active: boolean;
  onClick: () => void;
}) {
  const last = chat.messages[chat.messages.length - 1];
  const preview = chat.draft
    ? `Draft: ${chat.draft}`
    : chat.typing
      ? "typing…"
      : last?.kind === "text"
        ? last.body
        : last
          ? `${last.kind === "voicemail" ? "Voicemail" : last.kind === "voice" ? "Voice message" : last.kind === "poll" ? "Poll" : last.kind === "image" ? "Photo" : last.kind === "event" ? "Event" : "Attachment"}`
          : "No messages yet";

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
        active ? "bg-secondary" : "hover:bg-secondary/60",
      )}
    >
      <EchoAvatar
        initials={chat.avatar}
        color={chat.color}
        {...(chat.presence ? { presence: chat.presence } : {})}
        square={chat.kind === "group"}
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{chat.name}</span>
          {chat.pinned ? <Pin className="h-3 w-3 shrink-0 text-muted-foreground" /> : null}
          <span className="shrink-0 text-[11px] text-muted-foreground">{chat.lastActivity}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-[13px]",
              chat.draft ? "text-warning" : chat.typing ? "text-primary" : "text-muted-foreground",
            )}
          >
            {preview}
          </span>
          {chat.unread ? (
            <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-bold text-primary-foreground">
              {chat.unread}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
