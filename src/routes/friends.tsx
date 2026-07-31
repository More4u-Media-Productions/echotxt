import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus, Check, X, ShieldBan, UserMinus, Users, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, SearchField } from "@/components/echo/app-shell";
import { EchoAvatar, PresenceLabel } from "@/components/echo/avatar";
import {
  blockedUsers,
  friendRequests,
  suggestedFriends,
  users,
  type EchoUser,
} from "@/lib/echo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends — Echo" },
      {
        name: "description",
        content:
          "Manage friend requests, find people by username, see mutual friends and control who can reach you on Echo.",
      },
      { property: "og:title", content: "Friends — Echo" },
      {
        property: "og:description",
        content: "Friend requests, suggestions, mutual friends and blocked accounts in one place.",
      },
    ],
  }),
  component: FriendsPage,
});

type Tab = "friends" | "requests" | "suggested" | "blocked";

function FriendsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const [query, setQuery] = useState("");
  const [requests, setRequests] = useState(friendRequests);

  const filtered = users.filter(
    (u) =>
      u.displayName.toLowerCase().includes(query.toLowerCase()) ||
      u.username.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <AppShell
      title="Friends"
      subtitle={`${users.length} friends · ${requests.length} pending requests`}
      actions={
        <button
          onClick={() => toast("Invite link copied", { description: "echo.app/i/skyfox" })}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-soft"
        >
          <UserPlus className="h-4 w-4" />
          <span className="hidden sm:inline">Invite</span>
        </button>
      }
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-5 sm:px-6">
        <SearchField value={query} onChange={setQuery} placeholder="Search by username" />

        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {(
            [
              ["friends", "All friends"],
              ["requests", `Requests (${requests.length})`],
              ["suggested", "Suggested"],
              ["blocked", "Blocked"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                tab === key
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2.5">
          {tab === "friends" &&
            (filtered.length ? (
              filtered.map((u) => <FriendCard key={u.id} user={u} />)
            ) : (
              <EmptyState
                icon={Users}
                title="No matches"
                detail="Try a different username — people on Echo are found by @handle."
              />
            ))}

          {tab === "requests" &&
            (requests.length ? (
              requests.map((r) => (
                <article
                  key={r.id}
                  className="animate-pop rounded-3xl border border-border bg-surface p-4 shadow-soft"
                >
                  <div className="flex items-start gap-3">
                    <EchoAvatar initials={r.user.avatar} color={r.user.color} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{r.user.displayName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {r.user.username} · {r.user.mutuals} mutual · {r.time}
                      </p>
                      <p className="mt-1.5 text-sm text-foreground/90">{r.note}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => {
                        setRequests((p) => p.filter((x) => x.id !== r.id));
                        toast(`${r.user.username} is now a friend`);
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
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                icon={UserPlus}
                title="No pending requests"
                detail="Share your invite link and people can add you by username."
              />
            ))}

          {tab === "suggested" &&
            suggestedFriends.map((u) => <FriendCard key={u.id} user={u} suggested />)}

          {tab === "blocked" &&
            (blockedUsers.length ? (
              blockedUsers.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4"
                >
                  <EchoAvatar initials="DD" color="oklch(0.55 0.02 250)" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{b.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {b.username} · blocked {b.time} · {b.reason}
                    </p>
                  </div>
                  <button
                    onClick={() => toast("Unblocked")}
                    className="rounded-full border border-border px-3.5 py-1.5 text-xs font-medium"
                  >
                    Unblock
                  </button>
                </div>
              ))
            ) : (
              <EmptyState icon={ShieldBan} title="No blocked users" detail="Your list is clean." />
            ))}
        </div>
      </div>
    </AppShell>
  );
}

function FriendCard({ user, suggested }: { user: EchoUser; suggested?: boolean }) {
  return (
    <article className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3.5 shadow-soft transition-shadow hover:shadow-lift">
      <EchoAvatar initials={user.avatar} color={user.color} presence={user.presence} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {user.username} · {user.mutuals} mutual friends
        </p>
        <PresenceLabel presence={user.presence} lastSeen={user.lastSeen} />
      </div>
      {suggested ? (
        <button
          onClick={() => toast(`Friend request sent to ${user.username}`)}
          className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add
        </button>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={() => toast(`Opening chat with ${user.username}`)}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Message"
          >
            <MessageCircle className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => toast("Friend removed")}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
            aria-label="Remove friend"
          >
            <UserMinus className="h-[18px] w-[18px]" />
          </button>
        </div>
      )}
    </article>
  );
}
