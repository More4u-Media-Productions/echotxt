import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, SearchField } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import {
  useDiscoverProfiles,
  useFriendships,
  useRespondFriendRequest,
  useSearchProfiles,
  useSendFriendRequest,
  useUpdateFriendship,
} from "@/lib/echo-queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "Friends — find people by @username on Echo" },
      {
        name: "description",
        content: "Search Echo by @username, review friend requests and discover new people.",
      },
      { property: "og:title", content: "Friends — Echo" },
      { property: "og:description", content: "Add friends on Echo with usernames, not numbers." },
    ],
  }),
  component: FriendsPage,
});

type Tab = "friends" | "requests" | "discover";

function FriendsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const [query, setQuery] = useState("");
  const friendships = useFriendships();
  const search = useSearchProfiles(query);
  const discover = useDiscoverProfiles();
  const sendRequest = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const update = useUpdateFriendship();

  const edges = friendships.data ?? [];
  const friends = edges.filter((e) => e.status === "accepted");
  const requests = edges.filter((e) => e.status === "pending");
  const known = new Set(edges.map((e) => e.profile.id));
  const people = (query.trim() ? (search.data ?? []) : (discover.data ?? [])).filter(
    (p) => !known.has(p.id),
  );

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "friends", label: "Friends", count: friends.length },
    { key: "requests", label: "Requests", count: requests.length },
    { key: "discover", label: "Discover", count: 0 },
  ];

  return (
    <AppShell title="Friends" subtitle={`${friends.length} connected`}>
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <SearchField value={query} onChange={setQuery} placeholder="Search @username or name" />
        <div className="mt-3 flex gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                tab === t.key
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-surface text-muted-foreground",
              )}
            >
              {t.label}
              {t.count ? ` · ${t.count}` : ""}
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-2">
          {tab === "friends" &&
            (friends.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No friends yet"
                detail="Search for an @username or check the Discover tab."
              />
            ) : (
              friends.map((f) => (
                <Row key={f.id} name={f.profile.displayName} handle={f.profile.username} avatar={f.profile.avatar} color={f.profile.color}>
                  <button
                    onClick={() => update.mutate({ id: f.id, remove: true })}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    Remove
                  </button>
                </Row>
              ))
            ))}

          {tab === "requests" &&
            (requests.length === 0 ? (
              <EmptyState icon={UserPlus} title="No pending requests" detail="You're all caught up." />
            ) : (
              requests.map((r) => (
                <Row key={r.id} name={r.profile.displayName} handle={r.profile.username} avatar={r.profile.avatar} color={r.profile.color}>
                  {r.incoming ? (
                    <>
                      <button
                        onClick={() =>
                          respond.mutate({ id: r.id, accept: true, otherId: r.profile.id })
                        }
                        className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() =>
                          respond.mutate({ id: r.id, accept: false, otherId: r.profile.id })
                        }
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                      >
                        Decline
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground">Request sent</span>
                  )}
                </Row>
              ))
            ))}

          {tab === "discover" &&
            (people.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="Nobody to show"
                detail="Try searching for an exact @username."
              />
            ) : (
              people.map((p) => (
                <Row key={p.id} name={p.displayName} handle={p.username} avatar={p.avatar} color={p.color}>
                  <button
                    onClick={() =>
                      sendRequest.mutate(
                        { userId: p.id, displayName: p.displayName },
                        { onSuccess: () => toast.success(`Request sent to ${p.username}`) },
                      )
                    }
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Add
                  </button>
                </Row>
              ))
            ))}
        </div>
      </div>
    </AppShell>
  );
}

function Row({
  name,
  handle,
  avatar,
  color,
  children,
}: {
  name: string;
  handle: string;
  avatar: string;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <EchoAvatar initials={avatar} color={color} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{handle}</p>
      </div>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </div>
  );
}
