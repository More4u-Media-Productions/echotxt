import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { MessageCircle } from "lucide-react";
import { AppShell, EmptyState, SearchField } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { Conversation } from "@/components/echo/conversation";
import { useChats, useUpdateChatFlags } from "@/lib/echo-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Echo — private messaging with usernames" },
      {
        name: "description",
        content:
          "Echo is a private messenger built on @usernames instead of phone numbers. Chats, groups, calls and message requests in one calm app.",
      },
      { property: "og:title", content: "Echo — private messaging with usernames" },
      {
        property: "og:description",
        content: "Chats, groups, calls and message requests — no phone number required.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatsPage,
});

type Filter = "all" | "unread" | "requests" | "archived";

function ChatsPage() {
  const chats = useChats();
  const flags = useUpdateChatFlags();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const all = chats.data ?? [];
  const visible = all
    .filter((c) => {
      if (filter === "archived") return c.archived;
      if (filter === "requests") return !c.accepted && !c.archived;
      if (filter === "unread") return c.unread > 0 && c.accepted && !c.archived;
      return c.accepted && !c.archived;
    })
    .filter((c) =>
      query.trim()
        ? (c.name + c.handle).toLowerCase().includes(query.trim().toLowerCase())
        : true,
    );

  const open = all.find((c) => c.id === openId) ?? null;

  const tabs: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "unread", label: "Unread" },
    { key: "requests", label: "Requests" },
    { key: "archived", label: "Archived" },
  ];

  return (
    <AppShell
      title="Chats"
      subtitle={`${all.filter((c) => c.accepted && !c.archived).length} conversations`}
      contentClassName="lg:h-[calc(100vh-69px)] lg:overflow-hidden"
    >
      <div className="grid h-full min-h-0 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
        <div
          className={cn(
            "min-h-0 overflow-y-auto border-border px-4 py-4 lg:border-r",
            open && "hidden lg:block",
          )}
        >
          <SearchField value={query} onChange={setQuery} placeholder="Search chats or @username" />
          <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                  filter === t.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-surface text-muted-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {chats.isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Loading chats…</p>
          ) : visible.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No conversations here"
              detail="Add a friend by @username to start your first Echo chat."
            />
          ) : (
            <ul className="mt-3 space-y-1">
              {visible.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setOpenId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors",
                      openId === c.id ? "bg-secondary" : "hover:bg-secondary/60",
                    )}
                  >
                    <EchoAvatar
                      initials={c.avatar}
                      color={c.color}
                      {...(c.presence ? { presence: c.presence } : {})}
                      size="md"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                          {c.name}
                        </span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {c.lastActivity}
                        </span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {c.lastMessage ?? "No messages yet"}
                        </span>
                        {c.unread ? (
                          <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                            {c.unread}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                  {!c.accepted ? (
                    <div className="flex gap-2 px-3 pb-3">
                      <button
                        onClick={() => flags.mutate({ conversationId: c.id, accepted: true })}
                        className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => flags.mutate({ conversationId: c.id, archived: true })}
                        className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
                      >
                        Ignore
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={cn("min-h-0", !open && "hidden lg:block")}>
          {open ? (
            <Conversation chat={open} onBack={() => setOpenId(null)} />
          ) : (
            <div className="hidden h-full place-items-center lg:grid">
              <EmptyState
                icon={MessageCircle}
                title="Pick a conversation"
                detail="Select a chat on the left to read and reply."
              />
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
