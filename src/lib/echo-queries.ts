import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { notifyNewMessage } from "@/lib/push.functions";

import { toProfile, useUserId, type ProfileRow } from "@/lib/session";
import {
  clockTime,
  initialsOf,
  relativeTime,
  type EchoChat,
  type EchoMessage,
  type EchoProfile,
  type GroupMember,
  type GroupRole,
  type MessageKind,
  type Presence,
  type Reaction,
  type ReplyPreview,
  type Visibility,
} from "@/lib/echo-data";


/* ---------------------------------- realtime --------------------------------- */

/**
 * One app-wide realtime channel for list-level data (chats, friends, activity).
 * Per-conversation streams live in `useConversationRealtime`.
 */
export function useEchoRealtime() {
  const queryClient = useQueryClient();
  const userId = useUserId();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("echo-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
        void queryClient.invalidateQueries({ queryKey: ["group-members"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friendships" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["friendships"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);
}

/**
 * Live stream for the conversation that is currently open: new messages, edits,
 * deletions, reactions and read receipts. Exactly one channel per conversation.
 */
export function useConversationRealtime(conversationId: string | null) {
  const queryClient = useQueryClient();
  const userId = useUserId();

  useEffect(() => {
    if (!conversationId || !userId) return;
    const filter = `conversation_id=eq.${conversationId}`;
    const refreshMessages = () => {
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    };

    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter }, refreshMessages)
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () =>
        queryClient.invalidateQueries({ queryKey: ["messages", conversationId] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "message_read_receipts" }, () =>
        queryClient.invalidateQueries({ queryKey: ["receipts", conversationId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversation_members", filter },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["group-members", conversationId] });
          void queryClient.invalidateQueries({ queryKey: ["chats"] });
        },
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, queryClient, userId]);
}


/* ----------------------------------- chats ----------------------------------- */

export function useChats() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["chats", userId],
    enabled: !!userId,
    queryFn: async (): Promise<EchoChat[]> => {
      const { data: mine, error } = await supabase
        .from("conversation_members")
        .select("*, conversations(*)")
        .eq("user_id", userId!);
      if (error) throw error;
      const rows = mine ?? [];
      const ids = rows.map((r) => r.conversation_id);
      if (ids.length === 0) return [];

      const [{ data: members }, { data: recent }] = await Promise.all([
        supabase
          .from("conversation_members")
          .select("conversation_id, user_id, profiles!conversation_members_user_id_fkey(*)")
          .in("conversation_id", ids),
        supabase
          .from("messages")
          .select("id, conversation_id, body, kind, created_at, sender_id")
          .in("conversation_id", ids)
          .order("created_at", { ascending: false })
          .limit(500),
      ]);

      return rows
        .map((row): EchoChat => {
          const convo = row.conversations!;
          const all = (members ?? []).filter((m) => m.conversation_id === row.conversation_id);
          const others = all.filter((m) => m.user_id !== userId);
          const otherProfile = others[0]?.profiles
            ? toProfile(others[0]!.profiles as unknown as ProfileRow)
            : null;
          const convoMessages = (recent ?? []).filter(
            (m) => m.conversation_id === row.conversation_id,
          );
          const last = convoMessages[0];
          const unread = convoMessages.filter(
            (m) => m.sender_id !== userId && m.created_at > row.last_read_at,
          ).length;

          const isGroup = convo.kind === "group";
          const name = isGroup ? (convo.title ?? "Group") : (otherProfile?.displayName ?? "Unknown");

          const chat: EchoChat = {
            id: convo.id,
            kind: convo.kind,
            name,
            handle: isGroup ? `${all.length} members` : (otherProfile?.username ?? ""),
            avatar: initialsOf(name),
            avatarUrl: isGroup ? convo.avatar_url : (otherProfile?.avatarUrl ?? null),
            bannerUrl: convo.banner_url ?? null,
            color: isGroup ? convo.avatar_color : (otherProfile?.color ?? convo.avatar_color),
            members: all.length,
            memberIds: all.map((m) => m.user_id),
            description: convo.description,
            pinned: row.pinned,
            muted: row.muted,
            archived: row.archived,
            accepted: row.accepted,
            unread,
            lastActivity: relativeTime(last?.created_at ?? convo.last_message_at),
            lastMessage: last ? previewOf(last.kind, last.body) : null,
            lastMessageAt: last?.created_at ?? convo.last_message_at,
            createdBy: convo.created_by,
            myRole: (row.role as GroupRole) ?? "member",
            onlyAdminsPost: convo.only_admins_post,
            onlyAdminsInvite: convo.only_admins_invite,

          };
          if (!isGroup && otherProfile) {
            chat.presence = otherProfile.presence;
            chat.otherUserId = otherProfile.id;
          }
          return chat;
        })
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.lastMessageAt.localeCompare(a.lastMessageAt);
        });
    },
  });
}

function previewOf(kind: string, body: string): string {
  if (kind === "voice") return "🎙 Voice message";
  if (kind === "voicemail") return "📮 Voicemail";
  if (kind === "image") return "🖼 Photo";
  if (kind === "file") return "📎 File";
  if (kind === "poll") return "📊 Poll";
  return body;
}

/* --------------------------------- messages ---------------------------------- */

const PAGE_SIZE = 30;

const MESSAGE_SELECT =
  "*, profiles!messages_sender_id_fkey(*), message_reactions(emoji, user_id), " +
  "message_bookmarks(user_id), message_hides(user_id), " +
  "reply:reply_to(id, body, kind, deleted_at, sender_id, profiles!messages_sender_id_fkey(display_name, username))";

type MessagePage = EchoMessage[];

function replyPreviewOf(raw: unknown): ReplyPreview | null {
  const row = (Array.isArray(raw) ? raw[0] : raw) as Record<string, any> | null | undefined;
  if (!row) return null;
  const author = (Array.isArray(row['profiles']) ? row['profiles'][0] : row['profiles']) as
    | { display_name?: string; username?: string }
    | null;
  const deleted = !!row['deleted_at'];
  return {
    id: row['id'],
    authorName: author?.display_name || author?.username || "Someone",
    body: deleted ? "Message deleted" : previewOf(row['kind'], row['body'] ?? ""),
    kind: (row['kind'] ?? "text") as MessageKind,
    deleted,
  };
}

function mapMessageRow(row: Record<string, any>, userId: string | null): EchoMessage {
  const author = toProfile(row['profiles'] as unknown as ProfileRow);
  const grouped = new Map<string, Reaction>();
  for (const r of (row['message_reactions'] ?? []) as { emoji: string; user_id: string }[]) {
    const entry = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false, userIds: [] };
    entry.count += 1;
    entry.userIds.push(r.user_id);
    if (r.user_id === userId) entry.mine = true;
    grouped.set(r.emoji, entry);
  }
  const deleted = !!row['deleted_at'];
  return {
    id: row['id'],
    authorId: row['sender_id'],
    authorName: author.displayName,
    authorColor: author.color,
    authorInitials: author.avatar,
    authorAvatarUrl: author.avatarUrl,
    kind: row['kind'] as MessageKind,
    body: deleted ? "" : row['body'],
    metadata: (row['metadata'] ?? {}) as Record<string, unknown>,
    attachmentUrl: deleted ? null : (row['attachment_url'] ?? null),
    attachmentType: deleted ? null : (row['attachment_type'] ?? null),
    attachmentName: deleted ? null : (row['attachment_name'] ?? null),
    attachmentSize: deleted ? null : (row['attachment_size'] ?? null),

    createdAt: row['created_at'],
    time: clockTime(row['created_at']),
    edited: !deleted && !!row['edited_at'],
    editedAt: row['edited_at'] ?? null,
    pinned: !deleted && row['pinned'],
    bookmarked: ((row['message_bookmarks'] ?? []) as unknown[]).length > 0,
    deleted,
    deletedByMe: row['deleted_by'] === userId,
    replyToId: row['reply_to'] ?? null,
    replyTo: deleted ? null : replyPreviewOf(row['reply']),
    reactions: [...grouped.values()],
    readByAll: false,
    status: "sent",
  } satisfies EchoMessage;
}

/** True when the signed-in user chose "delete for me" on this row. */
function isHidden(row: Record<string, any>): boolean {
  return ((row['message_hides'] ?? []) as unknown[]).length > 0;
}


/**
 * Keyset-paginated message history, newest page first. Flattened output is in
 * chronological order so the UI can render it directly.
 */
export function useMessages(conversationId: string | null) {
  const userId = useUserId();
  const query = useInfiniteQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId && !!userId,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      let request = supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);
      if (pageParam) request = request.lt("created_at", pageParam);
      const { data, error } = await request;
      if (error) throw error;
      return (data ?? [])
        .filter((row) => !isHidden(row as Record<string, any>))
        .map((row) => mapMessageRow(row as Record<string, any>, userId));
    },
    getNextPageParam: (last) =>
      last.length < PAGE_SIZE ? undefined : (last[last.length - 1]?.createdAt ?? undefined),
  });

  const flat: EchoMessage[] = [];
  const seen = new Set<string>();
  for (const page of [...(query.data?.pages ?? [])].reverse()) {
    for (const message of [...page].reverse()) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      flat.push(message);
    }
  }
  flat.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return {
    data: flat,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
  };
}

/** Read receipts for every message in a conversation, keyed by message id. */
export function useReadReceipts(conversationId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["receipts", conversationId],
    enabled: !!conversationId && !!userId,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from("message_read_receipts")
        .select("message_id, user_id, messages!inner(conversation_id)")
        .eq("messages.conversation_id", conversationId!);
      if (error) throw error;
      const map: Record<string, string[]> = {};
      for (const row of data ?? []) {
        (map[row.message_id] ??= []).push(row.user_id);
      }
      return map;
    },
  });
}

export function useSendMessage() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      body: string;
      kind?: MessageKind;
      metadata?: Record<string, unknown>;
      attachmentUrl?: string | null;
      attachmentType?: string | null;
      attachmentName?: string | null;
      attachmentSize?: number | null;
      replyToId?: string | null;
      replyTo?: ReplyPreview | null;
      tempId?: string;
    }) => {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          conversation_id: input.conversationId,
          sender_id: userId!,
          body: input.body,
          kind: input.kind ?? "text",
          metadata: (input.metadata ?? {}) as never,
          attachment_url: input.attachmentUrl ?? null,
          attachment_type: input.attachmentType ?? null,
          attachment_name: input.attachmentName ?? null,
          attachment_size: input.attachmentSize ?? null,
          reply_to: input.replyToId ?? null,
        })
        .select(MESSAGE_SELECT)
        .single();
      if (error) throw error;
      return mapMessageRow(data as Record<string, any>, userId);
    },

    onMutate: async (input) => {
      const tempId = input.tempId ?? `temp-${crypto.randomUUID()}`;
      input.tempId = tempId;
      const key = ["messages", input.conversationId];
      await queryClient.cancelQueries({ queryKey: key });
      const profile = queryClient.getQueryData<EchoProfile | null>(["profile", userId]);
      const now = new Date().toISOString();
      const optimistic: EchoMessage = {
        id: tempId,
        authorId: userId!,
        authorName: profile?.displayName ?? "You",
        authorColor: profile?.color ?? "oklch(0.63 0.13 195)",
        authorInitials: profile?.avatar ?? "?",
        authorAvatarUrl: profile?.avatarUrl ?? null,
        kind: input.kind ?? "text",
        body: input.body,
        metadata: input.metadata ?? {},
        attachmentUrl: input.attachmentUrl ?? null,
        attachmentType: input.attachmentType ?? null,
        attachmentName: input.attachmentName ?? null,
        attachmentSize: input.attachmentSize ?? null,

        createdAt: now,
        time: clockTime(now),
        edited: false,
        editedAt: null,
        pinned: false,
        bookmarked: false,
        deleted: false,
        deletedByMe: false,
        replyToId: input.replyToId ?? null,
        replyTo: input.replyTo ?? null,
        reactions: [],
        readByAll: false,
        status: "sending",
      };

      queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(key, (old) => {
        if (!old) return old;
        const pages = old.pages.map((p) => [...p]);
        pages[0] = [optimistic, ...(pages[0] ?? [])];
        return { ...old, pages };
      });
      return { tempId };
    },
    onError: (_err, input, context) => {
      const tempId = context?.tempId ?? input.tempId;
      if (!tempId) return;
      queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(
        ["messages", input.conversationId],
        (old) =>
          old
            ? {
                ...old,
                pages: old.pages.map((page) =>
                  page.map((m) => (m.id === tempId ? { ...m, status: "failed" as const } : m)),
                ),
              }
            : old,
      );
    },
    onSuccess: (saved, input, context) => {
      const tempId = context?.tempId ?? input.tempId;
      queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(
        ["messages", input.conversationId],
        (old) => {
          if (!old) return old;
          const pages = old.pages.map((page) =>
            page.filter((m) => m.id !== tempId && m.id !== saved.id),
          );
          pages[0] = [saved, ...(pages[0] ?? [])];
          return { ...old, pages };
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
      // Web push for everyone else in the thread (server resolves recipients).
      if (saved.kind !== "system") {
        void notifyNewMessage({
          data: {
            conversationId: input.conversationId,
            title: saved.authorName.slice(0, 80),
            preview: previewOf(saved.kind, saved.body).slice(0, 160) || "Sent an attachment",
          },
        }).catch(() => undefined);
      }

    },
  });
}

/** Removes a message that failed to send from the local cache. */
export function useDiscardFailedMessage() {
  const queryClient = useQueryClient();
  return (conversationId: string, messageId: string) => {
    queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(
      ["messages", conversationId],
      (old) =>
        old ? { ...old, pages: old.pages.map((p) => p.filter((m) => m.id !== messageId)) } : old,
    );
  };
}

function patchMessage(
  queryClient: ReturnType<typeof useQueryClient>,
  conversationId: string,
  messageId: string,
  patch: (message: EchoMessage) => EchoMessage,
) {
  queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(
    ["messages", conversationId],
    (old) =>
      old
        ? {
            ...old,
            pages: old.pages.map((page) =>
              page.map((m) => (m.id === messageId ? patch(m) : m)),
            ),
          }
        : old,
  );
}

/**
 * "Delete for everyone": leaves a tombstone so the row stays as a reply target
 * and every member sees the same placeholder. Any attachment is removed too.
 */
export function useDeleteMessage() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      messageId: string;
      attachmentUrl?: string | null;
    }) => {
      const { error } = await supabase
        .from("messages")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by: userId!,
          body: "",
          attachment_url: null,
          attachment_type: null,
          attachment_name: null,
          attachment_size: null,
          pinned: false,
          metadata: {} as never,
        })
        .eq("id", input.messageId);
      if (error) throw error;
      if (input.attachmentUrl) {
        await supabase.storage.from("chat-media").remove([input.attachmentUrl]);
      }
      await supabase.from("message_reactions").delete().eq("message_id", input.messageId);
    },
    onSuccess: (_r, input) => {
      patchMessage(queryClient, input.conversationId, input.messageId, (m) => ({
        ...m,
        deleted: true,
        deletedByMe: true,
        body: "",
        attachmentUrl: null,
        attachmentType: null,
        attachmentName: null,
        attachmentSize: null,
        pinned: false,
        reactions: [],
        replyTo: null,
      }));
      void queryClient.invalidateQueries({ queryKey: ["messages", input.conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

/** "Delete for me": hides the message for the signed-in user only. */
export function useHideMessage() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationId: string; messageId: string }) => {
      const { error } = await supabase
        .from("message_hides")
        .insert({ message_id: input.messageId, user_id: userId! });
      if (error && error.code !== "23505") throw error;
    },
    onSuccess: (_r, input) => {
      queryClient.setQueryData<InfiniteData<MessagePage, string | null>>(
        ["messages", input.conversationId],
        (old) =>
          old
            ? { ...old, pages: old.pages.map((p) => p.filter((m) => m.id !== input.messageId)) }
            : old,
      );
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/** Edits the text of one of my own messages. */
export function useEditMessage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationId: string; messageId: string; body: string }) => {
      const body = input.body.trim();
      if (!body) throw new Error("Message can't be empty.");
      const { error } = await supabase
        .from("messages")
        .update({ body, edited_at: new Date().toISOString() })
        .eq("id", input.messageId);
      if (error) throw error;
      return body;
    },
    onSuccess: (body, input) => {
      patchMessage(queryClient, input.conversationId, input.messageId, (m) => ({
        ...m,
        body,
        edited: true,
        editedAt: new Date().toISOString(),
      }));
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

/** Pins or unpins a message for the whole conversation. */
export function useTogglePin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      messageId: string;
      pinned: boolean;
    }) => {
      const { error } = await supabase.rpc("set_message_pinned", {
        _mid: input.messageId,
        _pinned: input.pinned,
      });
      if (error) throw error;
    },
    onSuccess: (_r, input) => {
      patchMessage(queryClient, input.conversationId, input.messageId, (m) => ({
        ...m,
        pinned: input.pinned,
      }));
      void queryClient.invalidateQueries({ queryKey: ["pinned", input.conversationId] });
    },
  });
}

/** Private per-user bookmark ("saved message"). */
export function useToggleBookmark() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      messageId: string;
      bookmarked: boolean;
    }) => {
      if (input.bookmarked) {
        const { error } = await supabase
          .from("message_bookmarks")
          .delete()
          .eq("message_id", input.messageId)
          .eq("user_id", userId!);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("message_bookmarks")
          .insert({ message_id: input.messageId, user_id: userId! });
        if (error && error.code !== "23505") throw error;
      }
    },
    onSuccess: (_r, input) => {
      patchMessage(queryClient, input.conversationId, input.messageId, (m) => ({
        ...m,
        bookmarked: !input.bookmarked,
      }));
      void queryClient.invalidateQueries({ queryKey: ["bookmarks"] });
    },
  });
}

/** Pinned messages for the conversation header strip. */
export function usePinnedMessages(conversationId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["pinned", conversationId],
    enabled: !!conversationId && !!userId,
    queryFn: async (): Promise<EchoMessage[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("conversation_id", conversationId!)
        .eq("pinned", true)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? [])
        .filter((row) => !isHidden(row as Record<string, any>))
        .map((row) => mapMessageRow(row as Record<string, any>, userId));
    },
  });
}

export interface BookmarkedMessage extends EchoMessage {
  conversationId: string;
  conversationName: string;
}

/** Every message the signed-in user saved, newest first. */
export function useBookmarks() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["bookmarks", userId],
    enabled: !!userId,
    queryFn: async (): Promise<BookmarkedMessage[]> => {
      const { data, error } = await supabase
        .from("message_bookmarks")
        .select(
          `created_at, messages!inner(${MESSAGE_SELECT}, conversations!inner(id, kind, title))`,
        )
        .eq("user_id", userId!)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? [])
        .map((row) => {
          const message = (row as Record<string, any>)['messages'] as Record<string, any>;
          if (!message || message['deleted_at'] || isHidden(message)) return null;
          const convo = message['conversations'] as Record<string, any>;
          return {
            ...mapMessageRow(message, userId),
            bookmarked: true,
            conversationId: convo?.['id'] ?? message['conversation_id'],
            conversationName:
              convo?.['kind'] === "group" ? (convo['title'] ?? "Group") : "Direct message",
          } satisfies BookmarkedMessage;
        })
        .filter((m): m is BookmarkedMessage => m !== null);
    },
  });
}

/** Loads a single message plus its neighbours so search results can jump to it. */
export function useMessageContext(conversationId: string | null, messageId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["message-context", conversationId, messageId],
    enabled: !!conversationId && !!messageId && !!userId,
    queryFn: async (): Promise<EchoMessage | null> => {
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("id", messageId!)
        .maybeSingle();
      if (error) throw error;
      return data ? mapMessageRow(data as Record<string, any>, userId) : null;
    },
  });
}



export function useToggleReaction() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { messageId: string; emoji: string; mine: boolean }) => {
      if (input.mine) {
        const { error } = await supabase
          .from("message_reactions")
          .delete()
          .eq("message_id", input.messageId)
          .eq("user_id", userId!)
          .eq("emoji", input.emoji);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("message_reactions")
          .insert({ message_id: input.messageId, user_id: userId!, emoji: input.emoji });
        if (error) throw error;
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages"] }),
  });
}

/**
 * Marks a conversation read: moves the member cursor and writes a read receipt
 * for every incoming message that doesn't have one yet.
 */
export function useMarkRead() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("conversation_members")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", userId!);
      if (error) throw error;

      const { data: incoming, error: readError } = await supabase
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .neq("sender_id", userId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (readError) throw readError;
      if (!incoming?.length) return;

      const { error: receiptError } = await supabase.from("message_read_receipts").upsert(
        incoming.map((m) => ({ message_id: m.id, user_id: userId! })),
        { onConflict: "message_id,user_id", ignoreDuplicates: true },
      );
      if (receiptError) throw receiptError;

      // Opening the chat clears its message notifications too.
      await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", userId!)
        .eq("conversation_id", conversationId)
        .eq("type", "message")
        .eq("read", false);
    },
    onSuccess: (_d, conversationId) => {
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
      void queryClient.invalidateQueries({ queryKey: ["receipts", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },

  });
}


export function useUpdateChatFlags() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      pinned?: boolean;
      muted?: boolean;
      archived?: boolean;
      accepted?: boolean;
    }) => {
      const { conversationId, ...patch } = input;
      const { error } = await supabase
        .from("conversation_members")
        .update(patch)
        .eq("conversation_id", conversationId)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
  });
}

export function useLeaveChat() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase
        .from("conversation_members")
        .delete()
        .eq("conversation_id", conversationId)
        .eq("user_id", userId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
  });
}

/* ------------------------------ create conversations ------------------------- */

export function useStartDm() {
  const queryClient = useQueryClient();
  return useMutation({
    // Database-side start-or-reuse: a unique DM key makes duplicates impossible.
    mutationFn: async (otherUserId: string): Promise<string> => {
      const { data, error } = await supabase.rpc("start_dm", { _other: otherUserId });
      if (error) throw error;
      if (!data) throw new Error("Could not open that conversation.");
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
  });
}


/* ---------------------------------- groups ----------------------------------- */

function useGroupInvalidate() {
  const queryClient = useQueryClient();
  return (conversationId?: string) => {
    void queryClient.invalidateQueries({ queryKey: ["chats"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    if (conversationId) {
      void queryClient.invalidateQueries({ queryKey: ["group-members", conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
    } else {
      void queryClient.invalidateQueries({ queryKey: ["group-members"] });
    }
  };
}

interface GroupMemberRow {
  user_id: string;
  role: string;
  accepted: boolean;
  joined_at: string;
  invited_by: string | null;
  username: string;
  display_name: string;
  avatar_color: string;
  avatar_url: string | null;
  presence: Presence;
}

/** Roster for a group: roles, invite state and presence, ordered owner → members. */
export function useGroupMembers(conversationId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["group-members", conversationId],
    enabled: !!conversationId && !!userId,
    queryFn: async (): Promise<GroupMember[]> => {
      const { data, error } = await supabase.rpc("group_members", { _cid: conversationId! });
      if (error) throw error;
      return ((data ?? []) as unknown as GroupMemberRow[]).map((row) => {
        const name = row.display_name || row.username;
        return {
          id: row.user_id,
          role: (row.role as GroupRole) ?? "member",
          accepted: row.accepted,
          joinedAt: row.joined_at,
          invitedBy: row.invited_by,
          username: `@${row.username}`,
          displayName: name,
          color: row.avatar_color,
          avatar: initialsOf(name),
          avatarUrl: row.avatar_url,
          presence: row.presence,
        } satisfies GroupMember;
      });
    },
  });
}

export function useCreateGroup() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      memberIds: string[];
    }): Promise<string> => {
      const { data, error } = await supabase.rpc("create_group", {
        _title: input.title,
        ...(input.description ? { _description: input.description } : {}),
        _member_ids: input.memberIds,
      });
      if (error) throw error;
      if (!data) throw new Error("Could not create that group.");
      return data;
    },
    onSuccess: () => invalidate(),
  });
}

export function useAddGroupMembers() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (input: { conversationId: string; memberIds: string[] }) => {
      const { data, error } = await supabase.rpc("add_group_members", {
        _cid: input.conversationId,
        _ids: input.memberIds,
      });
      if (error) throw error;
      return data ?? 0;
    },
    onSuccess: (_d, input) => invalidate(input.conversationId),
  });
}

export function useRemoveGroupMember() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (input: { conversationId: string; userId: string }) => {
      const { error } = await supabase.rpc("remove_group_member", {
        _cid: input.conversationId,
        _uid: input.userId,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => invalidate(input.conversationId),
  });
}

export function useSetGroupRole() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (input: { conversationId: string; userId: string; role: GroupRole }) => {
      const { error } = await supabase.rpc("set_group_role", {
        _cid: input.conversationId,
        _uid: input.userId,
        _role: input.role,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => invalidate(input.conversationId),
  });
}

export function useUpdateGroup() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      title?: string;
      description?: string | null;
      onlyAdminsPost?: boolean;
      onlyAdminsInvite?: boolean;
    }) => {
      const { error } = await supabase.rpc("update_group", {
        _cid: input.conversationId,
        ...(input.title !== undefined ? { _title: input.title } : {}),
        ...(input.description !== undefined ? { _description: input.description ?? "" } : {}),
        ...(input.onlyAdminsPost !== undefined ? { _only_admins_post: input.onlyAdminsPost } : {}),
        ...(input.onlyAdminsInvite !== undefined
          ? { _only_admins_invite: input.onlyAdminsInvite }
          : {}),
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => invalidate(input.conversationId),
  });
}

export function useRespondGroupInvite() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (input: { conversationId: string; accept: boolean }) => {
      const { error } = await supabase.rpc("respond_group_invite", {
        _cid: input.conversationId,
        _accept: input.accept,
      });
      if (error) throw error;
    },
    onSuccess: (_d, input) => invalidate(input.conversationId),
  });
}

export function useLeaveGroup() {
  const invalidate = useGroupInvalidate();
  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { error } = await supabase.rpc("leave_group", { _cid: conversationId });
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}


/* ---------------------------------- friends ---------------------------------- */

export type FriendStatus = "pending" | "accepted" | "blocked" | "declined";

export interface FriendEdge {
  id: string;
  status: FriendStatus;
  note: string | null;
  incoming: boolean;
  blockedBy: string | null;
  createdAt: string;
  profile: EchoProfile;
}

interface FriendshipRow {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: FriendStatus;
  note: string | null;
  blocked_by: string | null;
  created_at: string;
  requester: unknown;
  addressee: unknown;
}

export function useFriendships() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["friendships", userId],
    enabled: !!userId,
    queryFn: async (): Promise<FriendEdge[]> => {
      const { data, error } = await supabase
        .from("friendships")
        .select(
          "*, requester:profiles!friendships_requester_id_fkey(*), addressee:profiles!friendships_addressee_id_fkey(*)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as FriendshipRow[]).map((row) => {
        const incoming = row.addressee_id === userId;
        const other = incoming ? row.requester : row.addressee;
        return {
          id: row.id,
          status: row.status,
          note: row.note,
          incoming,
          blockedBy: row.blocked_by ?? null,
          createdAt: row.created_at,
          profile: toProfile(other as ProfileRow),
        };
      });
    },
  });
}

function selectEdges(edges: FriendEdge[] | undefined, pick: (e: FriendEdge) => boolean) {
  return (edges ?? []).filter(pick);
}

export function useFriends() {
  const q = useFriendships();
  return { ...q, friends: selectEdges(q.data, (e) => e.status === "accepted") };
}

export function useIncomingRequests() {
  const q = useFriendships();
  return {
    ...q,
    requests: selectEdges(q.data, (e) => e.status === "pending" && e.incoming),
  };
}

export function useSentRequests() {
  const q = useFriendships();
  return {
    ...q,
    requests: selectEdges(q.data, (e) => e.status === "pending" && !e.incoming),
  };
}

export function useBlockedUsers() {
  const userId = useUserId();
  const q = useFriendships();
  return {
    ...q,
    blocked: selectEdges(q.data, (e) => e.status === "blocked" && e.blockedBy === userId),
  };
}

/* ------------------------------ discovery / search --------------------------- */

export interface DiscoveredProfile extends EchoProfile {
  friendshipId: string | null;
  friendshipStatus: FriendStatus | null;
  incoming: boolean;
}

interface SearchRow {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  pronouns: string | null;
  avatar_color: string;
  avatar_url: string | null;
  banner_url: string | null;
  presence: Presence;
  friendship_id: string | null;
  friendship_status: FriendStatus | null;
  incoming: boolean | null;
  blocked_by?: string | null;
}

function toDiscovered(row: SearchRow): DiscoveredProfile {
  const base = toProfile({
    id: row.id,
    username: row.username,
    display_name: row.display_name,
    bio: row.bio,
    pronouns: row.pronouns,
    avatar_color: row.avatar_color,
    avatar_url: row.avatar_url,
    banner_url: row.banner_url,
    presence: row.presence,
    last_seen: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  return {
    ...base,
    friendshipId: row.friendship_id ?? null,
    friendshipStatus: row.friendship_status ?? null,
    incoming: !!row.incoming,
  };
}

export function useSearchProfiles(term: string) {
  const userId = useUserId();
  const q = term.trim().replace(/^@/, "");
  return useQuery({
    queryKey: ["profile-search", q, userId],
    enabled: !!userId && q.length >= 2,
    queryFn: async (): Promise<DiscoveredProfile[]> => {
      const { data, error } = await supabase.rpc("search_profiles", { _term: q, _limit: 20 });
      if (error) throw error;
      return ((data ?? []) as unknown as SearchRow[]).map(toDiscovered);
    },
  });
}

export function useDiscoverProfiles() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["discover", userId],
    enabled: !!userId,
    queryFn: async (): Promise<DiscoveredProfile[]> => {
      const { data, error } = await supabase.rpc("search_profiles", { _term: "", _limit: 12 });
      if (error) throw error;
      return ((data ?? []) as unknown as SearchRow[]).map(toDiscovered);
    },
  });
}

export function useProfilePreview(profileId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["profile-preview", profileId, userId],
    enabled: !!userId && !!profileId,
    queryFn: async (): Promise<DiscoveredProfile | null> => {
      const { data, error } = await supabase.rpc("public_profile", { _id: profileId! });
      if (error) throw error;
      const row = (data as unknown as SearchRow[])?.[0];
      return row ? toDiscovered(row) : null;
    },
  });
}

/* ------------------------------ friend mutations ----------------------------- */

function useFriendInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ["friendships"] });
    void queryClient.invalidateQueries({ queryKey: ["profile-search"] });
    void queryClient.invalidateQueries({ queryKey: ["profile-preview"] });
    void queryClient.invalidateQueries({ queryKey: ["discover"] });
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  };
}

export function useSendFriendRequest() {
  const userId = useUserId();
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { userId: string; note?: string; displayName?: string }) => {
      // Re-open a previously declined request instead of violating the unique pair.
      const { data: existing } = await supabase
        .from("friendships")
        .select("id, requester_id, status")
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${input.userId}),and(requester_id.eq.${input.userId},addressee_id.eq.${userId})`,
        )
        .maybeSingle();

      if (existing && existing.status === "blocked") {
        throw new Error("You can't send a request to this person.");
      }
      if (existing && existing.status === "accepted") {
        throw new Error("You're already friends.");
      }

      if (existing) {
        const { error } = await supabase
          .from("friendships")
          .update({
            status: "pending",
            requester_id: userId!,
            addressee_id: input.userId,
            note: input.note ?? null,
            responded_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("friendships").insert({
          requester_id: userId!,
          addressee_id: input.userId,
          note: input.note ?? null,
        });
        if (error) throw error;
      }

      await supabase.from("notifications").insert({
        user_id: input.userId,
        actor_id: userId!,
        type: "friend_request",
        title: "New friend request",
        detail: input.note ?? "wants to connect on Echo",
      });
    },
    onSuccess: invalidate,
  });
}

export function useAcceptFriendRequest() {
  const userId = useUserId();
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; otherId: string }) => {
      const { error } = await supabase
        .from("friendships")
        .update({
          status: "accepted",
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: input.otherId,
        actor_id: userId!,
        type: "friend_request",
        title: "Friend request accepted",
        detail: "You are now connected on Echo",
      });
    },
    onSuccess: invalidate,
  });
}

export function useDeclineFriendRequest() {
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase
        .from("friendships")
        .update({
          status: "declined",
          responded_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCancelFriendRequest() {
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase.from("friendships").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useRemoveFriend() {
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase.from("friendships").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useBlockUser() {
  const userId = useUserId();
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id?: string | null; otherId: string }) => {
      if (input.id) {
        const { error } = await supabase
          .from("friendships")
          .update({
            status: "blocked",
            blocked_by: userId!,
            responded_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("friendships").insert({
        requester_id: userId!,
        addressee_id: input.otherId,
        status: "blocked",
        blocked_by: userId!,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useUnblockUser() {
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string }) => {
      const { error } = await supabase.from("friendships").delete().eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Legacy helpers kept so existing screens keep compiling. */
export function useRespondFriendRequest() {
  const accept = useAcceptFriendRequest();
  const decline = useDeclineFriendRequest();
  return useMutation({
    mutationFn: async (input: { id: string; accept: boolean; otherId: string }) => {
      if (input.accept) {
        await accept.mutateAsync({ id: input.id, otherId: input.otherId });
      } else {
        await decline.mutateAsync({ id: input.id });
      }
    },
  });
}

export function useUpdateFriendship() {
  const invalidate = useFriendInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; status?: FriendStatus; remove?: boolean }) => {
      if (input.remove) {
        const { error } = await supabase.from("friendships").delete().eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("friendships")
        .update({ status: input.status!, updated_at: new Date().toISOString() })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}


/* ----------------------------------- calls ----------------------------------- */

export interface CallRecord {
  id: string;
  conversationId: string;
  name: string;
  avatar: string;
  color: string;
  direction: "incoming" | "outgoing" | "missed";
  media: "voice" | "video";
  status: string;
  time: string;
  durationSeconds: number;
  group: boolean;
  voicemail: string | null;
}

export function useCalls() {
  const userId = useUserId();
  const chats = useChats();
  return useQuery({
    queryKey: ["calls", userId, chats.data?.length],
    enabled: !!userId && chats.isSuccess,
    queryFn: async (): Promise<CallRecord[]> => {
      const { data, error } = await supabase
        .from("calls")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const byId = new Map((chats.data ?? []).map((c) => [c.id, c]));
      return (data ?? []).map((row) => {
        const chat = byId.get(row.conversation_id);
        const outgoing = row.caller_id === userId;
        return {
          id: row.id,
          conversationId: row.conversation_id,
          name: chat?.name ?? "Conversation",
          avatar: chat?.avatar ?? "?",
          color: chat?.color ?? "oklch(0.63 0.13 195)",
          direction:
            row.status === "missed" || row.status === "voicemail"
              ? outgoing
                ? "outgoing"
                : "missed"
              : outgoing
                ? "outgoing"
                : "incoming",
          media: row.media,
          status: row.status,
          time: relativeTime(row.started_at),
          durationSeconds: row.duration_seconds,
          group: chat?.kind === "group",
          voicemail: row.voicemail_transcript,
        };
      });
    },
  });
}

export function useLogCall() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      media: "voice" | "video";
      status: "answered" | "missed" | "declined" | "voicemail";
      durationSeconds?: number;
      voicemailTranscript?: string;
    }) => {
      const { error } = await supabase.from("calls").insert({
        conversation_id: input.conversationId,
        caller_id: userId!,
        media: input.media,
        status: input.status,
        duration_seconds: input.durationSeconds ?? 0,
        voicemail_transcript: input.voicemailTranscript ?? null,
        ended_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["calls"] }),
  });
}

/* -------------------------------- notifications ------------------------------ */

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  detail: string;
  time: string;
  unread: boolean;
  actor: EchoProfile | null;
}

export function useNotifications() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["notifications", userId],
    enabled: !!userId,
    queryFn: async (): Promise<ActivityItem[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*, actor:profiles!notifications_actor_id_fkey(*)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id,
        type: row.type,
        title: row.title,
        detail: row.detail,
        time: relativeTime(row.created_at),
        unread: !row.read,
        actor: row.actor ? toProfile(row.actor as unknown as ProfileRow) : null,
      }));
    },
  });
}

export function useMarkNotifications() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; all?: boolean }) => {
      let query = supabase.from("notifications").update({ read: true }).eq("user_id", userId!);
      if (input.id) query = query.eq("id", input.id);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

/* --------------------------------- my profile -------------------------------- */

export function useUpdateProfile() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      username?: string;
      display_name?: string;
      bio?: string;
      pronouns?: string | null;
      presence?: Presence;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", userId!);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
