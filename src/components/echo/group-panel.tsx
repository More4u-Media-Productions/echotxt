import { useMemo, useState } from "react";
import { Check, LogOut, Plus, Shield, Trash2, X } from "lucide-react";
import { EchoAvatar } from "./avatar";
import { cn } from "@/lib/utils";
import type { EchoChat, GroupRole } from "@/lib/echo-data";
import { useUserId } from "@/lib/session";
import {
  useAddGroupMembers,
  useFriends,
  useGroupMembers,
  useLeaveGroup,
  useRemoveGroupMember,
  useSetGroupRole,
  useUpdateGroup,
} from "@/lib/echo-queries";

const ROLE_LABEL: Record<GroupRole, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

export function GroupPanel({
  chat,
  open,
  onClose,
  onLeft,
}: {
  chat: EchoChat;
  open: boolean;
  onClose: () => void;
  onLeft?: (() => void) | undefined;
}) {
  const userId = useUserId();
  const members = useGroupMembers(open ? chat.id : null);
  const { friends } = useFriends();
  const addMembers = useAddGroupMembers();
  const removeMember = useRemoveGroupMember();
  const setRole = useSetGroupRole();
  const updateGroup = useUpdateGroup();
  const leave = useLeaveGroup();

  const [title, setTitle] = useState(chat.name);
  const [description, setDescription] = useState(chat.description ?? "");
  const [inviting, setInviting] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const isOwner = chat.myRole === "owner";
  const isAdmin = chat.myRole === "owner" || chat.myRole === "admin";
  const canInvite = isAdmin || !chat.onlyAdminsInvite;

  const list = members.data ?? [];
  const memberIds = useMemo(() => new Set(list.map((m) => m.id)), [list]);
  const invitable = friends.filter((f) => !memberIds.has(f.profile.id));

  if (!open) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That action failed.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-background/70 backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl border border-border bg-surface shadow-soft sm:rounded-3xl">
        <header className="flex items-center gap-3 border-b border-border px-5 py-4">
          <EchoAvatar initials={chat.avatar} color={chat.color} avatarUrl={chat.avatarUrl} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{chat.name}</p>
            <p className="text-xs text-muted-foreground">
              {list.length} member{list.length === 1 ? "" : "s"} · you are{" "}
              {ROLE_LABEL[chat.myRole].toLowerCase()}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
            aria-label="Close group details"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}

          {isAdmin ? (
            <section className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Group details
              </p>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                className="h-11 w-full rounded-2xl border border-border bg-background px-4 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={280}
                placeholder="Description"
                className="w-full resize-none rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-ring/50"
              />
              <button
                onClick={() =>
                  void run(async () => {
                    await updateGroup.mutateAsync({
                      conversationId: chat.id,
                      title: title.trim(),
                      description: description.trim(),
                    });
                    setSaved(true);
                    setTimeout(() => setSaved(false), 1500);
                  })
                }
                disabled={updateGroup.isPending || !title.trim()}
                className="h-10 w-full rounded-2xl bg-primary text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {saved ? "Saved" : updateGroup.isPending ? "Saving…" : "Save changes"}
              </button>

              <div className="mt-2 space-y-2">
                {(
                  [
                    ["onlyAdminsPost", "Only admins can send messages", chat.onlyAdminsPost],
                    ["onlyAdminsInvite", "Only admins can invite members", chat.onlyAdminsInvite],
                  ] as const
                ).map(([key, label, value]) => (
                  <button
                    key={key}
                    onClick={() =>
                      void run(() =>
                        updateGroup.mutateAsync({ conversationId: chat.id, [key]: !value }),
                      )
                    }
                    className="flex w-full items-center justify-between rounded-2xl border border-border bg-background px-4 py-3 text-left text-xs font-medium"
                  >
                    <span>{label}</span>
                    <span
                      className={cn(
                        "grid h-6 w-6 place-items-center rounded-full border",
                        value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-transparent",
                      )}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            </section>
          ) : chat.description ? (
            <p className="text-sm text-muted-foreground">{chat.description}</p>
          ) : null}

          <section className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Members
            </p>
            {members.isLoading ? (
              <p className="py-4 text-center text-sm text-muted-foreground">Loading members…</p>
            ) : (
              <ul className="space-y-1">
                {list.map((m) => {
                  const isMe = m.id === userId;
                  const canRemove =
                    !isMe &&
                    isAdmin &&
                    m.role !== "owner" &&
                    (m.role !== "admin" || isOwner);
                  return (
                    <li
                      key={m.id}
                      className="flex items-center gap-3 rounded-2xl p-2.5 hover:bg-secondary/60"
                    >
                      <EchoAvatar
                        initials={m.avatar}
                        color={m.color}
                        avatarUrl={m.avatarUrl}
                        presence={m.presence}
                        size="sm"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {m.displayName}
                          {isMe ? " (you)" : ""}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {m.username} · {ROLE_LABEL[m.role]}
                          {m.accepted ? "" : " · invite pending"}
                        </p>
                      </div>
                      {isOwner && !isMe && m.accepted ? (
                        <button
                          onClick={() =>
                            void run(() =>
                              setRole.mutateAsync({
                                conversationId: chat.id,
                                userId: m.id,
                                role: m.role === "admin" ? "member" : "admin",
                              }),
                            )
                          }
                          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
                          aria-label={m.role === "admin" ? "Demote to member" : "Promote to admin"}
                          title={m.role === "admin" ? "Demote to member" : "Promote to admin"}
                        >
                          <Shield
                            className={cn("h-4 w-4", m.role === "admin" && "text-primary")}
                          />
                        </button>
                      ) : null}
                      {canRemove ? (
                        <button
                          onClick={() =>
                            void run(() =>
                              removeMember.mutateAsync({
                                conversationId: chat.id,
                                userId: m.id,
                              }),
                            )
                          }
                          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-destructive"
                          aria-label={`Remove ${m.displayName}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {canInvite ? (
            <section className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Invite friends
              </p>
              {invitable.length === 0 ? (
                <p className="py-3 text-sm text-muted-foreground">
                  All of your friends are already in this group.
                </p>
              ) : (
                <>
                  <ul className="space-y-1">
                    {invitable.map((f) => {
                      const on = inviting.includes(f.profile.id);
                      return (
                        <li key={f.profile.id}>
                          <button
                            onClick={() =>
                              setInviting((p) =>
                                on ? p.filter((id) => id !== f.profile.id) : [...p, f.profile.id],
                              )
                            }
                            className={cn(
                              "flex w-full items-center gap-3 rounded-2xl p-2.5 text-left transition-colors",
                              on ? "bg-secondary" : "hover:bg-secondary/60",
                            )}
                          >
                            <EchoAvatar
                              initials={f.profile.avatar}
                              color={f.profile.color}
                              avatarUrl={f.profile.avatarUrl}
                              size="sm"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {f.profile.displayName}
                              </span>
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {f.profile.username}
                              </span>
                            </span>
                            <span
                              className={cn(
                                "grid h-6 w-6 place-items-center rounded-full border",
                                on
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border text-transparent",
                              )}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <button
                    onClick={() =>
                      void run(async () => {
                        await addMembers.mutateAsync({
                          conversationId: chat.id,
                          memberIds: inviting,
                        });
                        setInviting([]);
                      })
                    }
                    disabled={addMembers.isPending || inviting.length === 0}
                    className="mt-1 inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-border bg-background text-xs font-semibold disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {addMembers.isPending
                      ? "Inviting…"
                      : `Invite ${inviting.length || ""}`.trim()}
                  </button>
                </>
              )}
            </section>
          ) : null}
        </div>

        <footer className="border-t border-border px-5 py-4">
          <button
            onClick={() =>
              void run(async () => {
                await leave.mutateAsync(chat.id);
                onClose();
                onLeft?.();
              })
            }
            disabled={leave.isPending}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 text-sm font-semibold text-destructive disabled:opacity-50"
          >
            <LogOut className="h-4 w-4" />
            {leave.isPending ? "Leaving…" : "Leave group"}
          </button>
        </footer>
      </div>
    </div>
  );
}
