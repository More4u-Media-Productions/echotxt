import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MessageCircle, Users } from "lucide-react";
import { AppShell, EmptyState, SearchField } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import { Conversation } from "@/components/echo/conversation";
import { NewGroupDialog } from "@/components/echo/new-group-dialog";
import { useChats, useRespondGroupInvite, useUpdateChatFlags } from "@/lib/echo-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Echo | Connect. Communicate. Together." },
      {
        name: "description",
        content:
          "Echo brings messaging, voice and video calls, groups, media sharing, AI-powered tools, and more together in one modern communication platform. | Made by More4u Productions",
      },
      { property: "og:title", content: "Echo | Connect. Communicate. Together." },
      {
        property: "og:description",
        content: "Echo brings messaging, voice and video calls, groups, media sharing, AI-powered tools, and more together in one modern communication platform. | Made by More4u Productions",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: "https://echotxt.lovable.app/" },
    ],
    links: [{ rel: "canonical", href: "https://echotxt.lovable.app/" }],
  }),
  validateSearch: (search: Record<string, unknown>): { c?: string; m?: string } => {
    const c = search['c'];
    const m = search['m'];
    return {
      ...(typeof c === "string" && c ? { c } : {}),
      ...(typeof m === "string" && m ? { m } : {}),
    };
  },

  component: ChatsPage,
});

type Filter = "all" | "unread" | "requests" | "archived";

function ChatsPage() {
  const { c, m } = Route.useSearch();
  const chats = useChats();
  const flags = useUpdateChatFlags();
  const respondInvite = useRespondGroupInvite();
  const [newGroup, setNewGroup] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(c ?? null);

  useEffect(() => {
    if (c) setOpenId(c);
  }, [c]);


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
      actions={
        <button
          onClick={() => setNewGroup(true)}
          className="inline-flex h-9 items-center gap-2 rounded-2xl bg-primary px-3 text-xs font-semibold text-primary-foreground"
        >
          <Users className="h-4 w-4" /> New group
        </button>
      }
    >
      <NewGroupDialog
        open={newGroup}
        onClose={() => setNewGroup(false)}
        onCreated={(id) => setOpenId(id)}
      />
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
          ) : chats.isError ? (
            <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-center">
              <p className="text-sm font-semibold">Couldn't load your chats</p>
              <button
                onClick={() => void chats.refetch()}
                className="mt-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
              >
                Try again
              </button>
            </div>
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
                      avatarUrl={c.avatarUrl}
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
                      {c.kind === "dm" && c.handle ? (
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {c.handle}
                        </span>
                      ) : null}
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
                        onClick={() => {
                          if (c.kind === "group") {
                            respondInvite.mutate({ conversationId: c.id, accept: true });
                          } else {
                            flags.mutate({ conversationId: c.id, accepted: true });
                          }
                        }}
                        className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground"
                      >
                        {c.kind === "group" ? "Join group" : "Accept"}
                      </button>
                      <button
                        onClick={() => {
                          if (c.kind === "group") {
                            respondInvite.mutate({ conversationId: c.id, accept: false });
                            if (openId === c.id) setOpenId(null);
                          } else {
                            flags.mutate({ conversationId: c.id, archived: true });
                          }
                        }}
                        className="rounded-full border border-border px-3 py-1 text-xs font-semibold text-muted-foreground"
                      >
                        {c.kind === "group" ? "Decline" : "Ignore"}
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
            <Conversation
              chat={open}
              onBack={() => setOpenId(null)}
              focusMessageId={open.id === c ? (m ?? null) : null}
            />
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
