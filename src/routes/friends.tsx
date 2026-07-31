import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertCircle, Ban, RefreshCw, Search, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { AppShell, EmptyState, SearchField } from "@/components/echo/app-shell";
import { EchoAvatar } from "@/components/echo/avatar";
import {
  useAcceptFriendRequest,
  useBlockUser,
  useCancelFriendRequest,
  useDeclineFriendRequest,
  useDiscoverProfiles,
  useFriendships,
  useProfilePreview,
  useRemoveFriend,
  useSearchProfiles,
  useSendFriendRequest,
  useStartDm,
  useUnblockUser,
  type FriendEdge,
} from "@/lib/echo-queries";
import { useUserId } from "@/lib/session";
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
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FriendsPage,
});

type Tab = "friends" | "requests" | "sent" | "add";

function FriendsPage() {
  const [tab, setTab] = useState<Tab>("friends");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const userId = useUserId();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const friendships = useFriendships();
  const search = useSearchProfiles(debounced);
  const discover = useDiscoverProfiles();

  const sendRequest = useSendFriendRequest();
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  const cancel = useCancelFriendRequest();
  const removeFriend = useRemoveFriend();
  const block = useBlockUser();
  const unblock = useUnblockUser();

  const edges = friendships.data ?? [];
  const friends = edges.filter((e) => e.status === "accepted");
  const incoming = edges.filter((e) => e.status === "pending" && e.incoming);
  const sent = edges.filter((e) => e.status === "pending" && !e.incoming);
  const blocked = edges.filter((e) => e.status === "blocked" && e.blockedBy === userId);

  const searching = debounced.trim().replace(/^@/, "").length >= 2;
  const listQuery = searching ? search : discover;
  const known = new Set(edges.map((e) => e.profile.id));
  const people = (listQuery.data ?? []).filter(
    (p) => !known.has(p.id) || p.friendshipStatus === "declined",
  );

  const fail = (err: unknown) =>
    toast.error(err instanceof Error ? err.message : "Something went wrong. Please try again.");

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "friends", label: "Friends", count: friends.length },
    { key: "requests", label: "Requests", count: incoming.length },
    { key: "sent", label: "Sent", count: sent.length },
    { key: "add", label: "Add friend", count: 0 },
  ];

  return (
    <AppShell title="Friends" subtitle={`${friends.length} connected`}>
      <div className="mx-auto max-w-2xl px-4 py-4 sm:px-6">
        <SearchField
          value={query}
          onChange={(v) => {
            setQuery(v);
            if (v.trim()) setTab("add");
          }}
          placeholder="Search @username or name"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
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
            (friendships.isPending ? (
              <SkeletonRows />
            ) : friendships.isError ? (
              <ErrorCard onRetry={() => void friendships.refetch()} />
            ) : friends.length === 0 ? (
              <EmptyState
                icon={Users}
                title="No friends yet"
                detail="Search for an @username to send your first friend request."
              />
            ) : (
              friends.map((f) => (
                <Row key={f.id} edge={f} onOpen={() => setPreviewId(f.profile.id)}>
                  <button
                    onClick={() => removeFriend.mutate({ id: f.id }, { onError: fail })}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    Remove
                  </button>
                </Row>
              ))
            ))}

          {tab === "requests" &&
            (friendships.isPending ? (
              <SkeletonRows />
            ) : friendships.isError ? (
              <ErrorCard onRetry={() => void friendships.refetch()} />
            ) : incoming.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No pending requests"
                detail="You're all caught up."
              />
            ) : (
              incoming.map((r) => (
                <Row key={r.id} edge={r} onOpen={() => setPreviewId(r.profile.id)}>
                  <button
                    onClick={() =>
                      accept.mutate(
                        { id: r.id, otherId: r.profile.id },
                        {
                          onSuccess: () => toast.success(`You and ${r.profile.username} are friends`),
                          onError: fail,
                        },
                      )
                    }
                    className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => decline.mutate({ id: r.id }, { onError: fail })}
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    Decline
                  </button>
                </Row>
              ))
            ))}

          {tab === "sent" &&
            (friendships.isPending ? (
              <SkeletonRows />
            ) : friendships.isError ? (
              <ErrorCard onRetry={() => void friendships.refetch()} />
            ) : sent.length === 0 ? (
              <EmptyState
                icon={UserPlus}
                title="No sent requests"
                detail="Requests you send will wait here until they're answered."
              />
            ) : (
              sent.map((r) => (
                <Row key={r.id} edge={r} onOpen={() => setPreviewId(r.profile.id)}>
                  <span className="self-center text-xs text-muted-foreground">Pending</span>
                  <button
                    onClick={() =>
                      cancel.mutate(
                        { id: r.id },
                        { onSuccess: () => toast.success("Request cancelled"), onError: fail },
                      )
                    }
                    className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                  >
                    Cancel
                  </button>
                </Row>
              ))
            ))}

          {tab === "add" && (
            <>
              {listQuery.isPending ? (
                <SkeletonRows />
              ) : listQuery.isError ? (
                <ErrorCard onRetry={() => void listQuery.refetch()} />
              ) : people.length === 0 ? (
                <EmptyState
                  icon={searching ? Search : UserPlus}
                  title={searching ? "No results" : "Nobody to show yet"}
                  detail={
                    searching
                      ? `No one on Echo matches “${debounced.trim()}”. Check the spelling of the @username.`
                      : "Type at least 2 characters to search Echo by @username."
                  }
                />
              ) : (
                people.map((p) => (
                  <Row
                    key={p.id}
                    name={p.displayName}
                    handle={p.username}
                    avatar={p.avatar}
                    avatarUrl={p.avatarUrl}
                    color={p.color}
                    onOpen={() => setPreviewId(p.id)}
                  >
                    <button
                      onClick={() =>
                        sendRequest.mutate(
                          { userId: p.id },
                          {
                            onSuccess: () => toast.success(`Request sent to ${p.username}`),
                            onError: fail,
                          },
                        )
                      }
                      className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
                    >
                      Add
                    </button>
                  </Row>
                ))
              )}

              {blocked.length > 0 && (
                <div className="pt-4">
                  <p className="px-1 pb-2 text-xs font-semibold text-muted-foreground">
                    Blocked · {blocked.length}
                  </p>
                  {blocked.map((b) => (
                    <Row key={b.id} edge={b} onOpen={() => setPreviewId(b.profile.id)}>
                      <button
                        onClick={() => unblock.mutate({ id: b.id }, { onError: fail })}
                        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
                      >
                        Unblock
                      </button>
                    </Row>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {previewId && (
        <ProfilePreview
          profileId={previewId}
          onClose={() => setPreviewId(null)}
          onError={fail}
          actions={{ sendRequest, accept, decline, cancel, removeFriend, block, unblock }}
        />
      )}
    </AppShell>
  );
}

/* --------------------------------- pieces ---------------------------------- */

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5"
        >
          <div className="h-10 w-10 shrink-0 animate-pulse rounded-2xl bg-secondary" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded-full bg-secondary" />
            <div className="h-3 w-20 animate-pulse rounded-full bg-secondary" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertCircle className="h-5 w-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Couldn't load</p>
        <p className="truncate text-xs text-muted-foreground">Check your connection and retry.</p>
      </div>
      <button
        onClick={onRetry}
        className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}

function Row({
  edge,
  name,
  handle,
  avatar,
  avatarUrl,
  color,
  onOpen,
  children,
}: {
  edge?: FriendEdge;
  name?: string;
  handle?: string;
  avatar?: string;
  avatarUrl?: string | null;
  color?: string;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const p = edge?.profile;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <EchoAvatar
          initials={p?.avatar ?? avatar ?? "?"}
          color={p?.color ?? color ?? "oklch(0.63 0.13 195)"}
          avatarUrl={p?.avatarUrl ?? avatarUrl}
          size="sm"
        />
        <span className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p?.displayName ?? name}</p>
          <p className="truncate text-xs text-muted-foreground">{p?.username ?? handle}</p>
        </span>
      </button>
      <div className="flex shrink-0 gap-1.5">{children}</div>
    </div>
  );
}

type Actions = {
  sendRequest: ReturnType<typeof useSendFriendRequest>;
  accept: ReturnType<typeof useAcceptFriendRequest>;
  decline: ReturnType<typeof useDeclineFriendRequest>;
  cancel: ReturnType<typeof useCancelFriendRequest>;
  removeFriend: ReturnType<typeof useRemoveFriend>;
  block: ReturnType<typeof useBlockUser>;
  unblock: ReturnType<typeof useUnblockUser>;
};

function ProfilePreview({
  profileId,
  onClose,
  onError,
  actions,
}: {
  profileId: string;
  onClose: () => void;
  onError: (err: unknown) => void;
  actions: Actions;
}) {
  const preview = useProfilePreview(profileId);
  const startDm = useStartDm();
  const navigate = useNavigate();
  const p = preview.data;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-6">
      <button className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl border border-border bg-surface p-6 shadow-soft sm:rounded-3xl">
        {preview.isPending ? (
          <div className="space-y-3">
            <div className="mx-auto h-16 w-16 animate-pulse rounded-3xl bg-secondary" />
            <div className="mx-auto h-3 w-32 animate-pulse rounded-full bg-secondary" />
            <div className="mx-auto h-3 w-20 animate-pulse rounded-full bg-secondary" />
          </div>
        ) : preview.isError || !p ? (
          <ErrorCard onRetry={() => void preview.refetch()} />
        ) : (
          <div className="text-center">
            <div className="mx-auto w-fit">
              <EchoAvatar initials={p.avatar} color={p.color} avatarUrl={p.avatarUrl} size="lg" />
            </div>
            <h2 className="mt-3 text-lg font-bold tracking-tight">{p.displayName}</h2>
            <p className="text-sm text-muted-foreground">{p.username}</p>
            {p.pronouns ? (
              <p className="mt-0.5 text-xs text-muted-foreground">{p.pronouns}</p>
            ) : null}
            <p className="mt-1 text-xs font-semibold text-muted-foreground capitalize">
              {p.presence}
            </p>
            {p.bio ? <p className="mt-3 text-sm text-muted-foreground">{p.bio}</p> : null}

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {p.friendshipStatus === "accepted" && (
                <>
                  <button
                    onClick={() =>
                      startDm.mutate(p.id, {
                        onSuccess: () => void navigate({ to: "/" }),
                        onError,
                      })
                    }
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Message
                  </button>
                  <button
                    onClick={() =>
                      actions.removeFriend.mutate(
                        { id: p.friendshipId! },
                        { onSuccess: onClose, onError },
                      )
                    }
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    Remove friend
                  </button>
                </>
              )}

              {p.friendshipStatus === "pending" && p.incoming && (
                <>
                  <button
                    onClick={() =>
                      actions.accept.mutate(
                        { id: p.friendshipId!, otherId: p.id },
                        { onSuccess: onClose, onError },
                      )
                    }
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() =>
                      actions.decline.mutate(
                        { id: p.friendshipId! },
                        { onSuccess: onClose, onError },
                      )
                    }
                    className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
                  >
                    Decline
                  </button>
                </>
              )}

              {p.friendshipStatus === "pending" && !p.incoming && (
                <button
                  onClick={() =>
                    actions.cancel.mutate({ id: p.friendshipId! }, { onSuccess: onClose, onError })
                  }
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
                >
                  Cancel request
                </button>
              )}

              {(p.friendshipStatus === null || p.friendshipStatus === "declined") && (
                <button
                  onClick={() =>
                    actions.sendRequest.mutate(
                      { userId: p.id },
                      {
                        onSuccess: () => {
                          toast.success(`Request sent to ${p.username}`);
                          onClose();
                        },
                        onError,
                      },
                    )
                  }
                  className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
                >
                  Add friend
                </button>
              )}

              {p.friendshipStatus === "blocked" ? (
                <button
                  onClick={() =>
                    actions.unblock.mutate({ id: p.friendshipId! }, { onSuccess: onClose, onError })
                  }
                  className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground"
                >
                  Unblock
                </button>
              ) : (
                <button
                  onClick={() =>
                    actions.block.mutate(
                      { id: p.friendshipId, otherId: p.id },
                      {
                        onSuccess: () => {
                          toast.success("User blocked");
                          onClose();
                        },
                        onError,
                      },
                    )
                  }
                  className="flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-xs font-semibold text-destructive"
                >
                  <Ban className="h-3.5 w-3.5" /> Block
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
