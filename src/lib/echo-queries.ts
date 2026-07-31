import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toProfile, useUserId, type ProfileRow } from "@/lib/session";
import {
  clockTime,
  initialsOf,
  relativeTime,
  type EchoChat,
  type EchoMessage,
  type EchoProfile,
  type MessageKind,
  type Presence,
} from "@/lib/echo-data";

/* ---------------------------------- realtime --------------------------------- */

export function useEchoRealtime() {
  const queryClient = useQueryClient();
  const userId = useUserId();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel("echo-stream")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "message_reactions" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["messages"] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_members" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["chats"] });
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
          .select("conversation_id, user_id, profiles(*)")
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

export function useMessages(conversationId: string | null) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["messages", conversationId],
    enabled: !!conversationId && !!userId,
    queryFn: async (): Promise<EchoMessage[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, profiles!messages_sender_id_fkey(*), message_reactions(emoji, user_id)")
        .eq("conversation_id", conversationId!)
        .order("created_at", { ascending: true })
        .limit(300);
      if (error) throw error;

      return (data ?? []).map((row) => {
        const author = toProfile(row.profiles as unknown as ProfileRow);
        const grouped = new Map<string, { emoji: string; count: number; mine: boolean }>();
        for (const r of row.message_reactions ?? []) {
          const entry = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
          entry.count += 1;
          if (r.user_id === userId) entry.mine = true;
          grouped.set(r.emoji, entry);
        }
        return {
          id: row.id,
          authorId: row.sender_id,
          authorName: author.displayName,
          authorColor: author.color,
          authorInitials: author.avatar,
          kind: row.kind as MessageKind,
          body: row.body,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
          createdAt: row.created_at,
          time: clockTime(row.created_at),
          edited: !!row.edited_at,
          pinned: row.pinned,
          reactions: [...grouped.values()],
          readByAll: false,
        } satisfies EchoMessage;
      });
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
    }) => {
      const { error } = await supabase.from("messages").insert({
        conversation_id: input.conversationId,
        sender_id: userId!,
        body: input.body,
        kind: input.kind ?? "text",
        metadata: (input.metadata ?? {}) as never,
      });
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["messages", vars.conversationId] });
      void queryClient.invalidateQueries({ queryKey: ["chats"] });
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
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
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
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string): Promise<string> => {
      const { data: mine } = await supabase
        .from("conversation_members")
        .select("conversation_id, conversations!inner(kind)")
        .eq("user_id", userId!)
        .eq("conversations.kind", "dm");
      const myIds = (mine ?? []).map((r) => r.conversation_id);
      if (myIds.length) {
        const { data: shared } = await supabase
          .from("conversation_members")
          .select("conversation_id")
          .eq("user_id", otherUserId)
          .in("conversation_id", myIds);
        const existing = shared?.[0]?.conversation_id;
        if (existing) return existing;
      }

      const { data: convo, error } = await supabase
        .from("conversations")
        .insert({ kind: "dm", created_by: userId! })
        .select("id")
        .single();
      if (error) throw error;

      const { data: friendship } = await supabase
        .from("friendships")
        .select("status")
        .or(
          `and(requester_id.eq.${userId},addressee_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},addressee_id.eq.${userId})`,
        )
        .maybeSingle();
      const areFriends = friendship?.status === "accepted";

      const { error: memberError } = await supabase.from("conversation_members").insert([
        { conversation_id: convo.id, user_id: userId!, role: "owner", accepted: true },
        { conversation_id: convo.id, user_id: otherUserId, accepted: areFriends },
      ]);
      if (memberError) throw memberError;
      return convo.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
  });
}

export function useCreateGroup() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      memberIds: string[];
    }): Promise<string> => {
      const { data: convo, error } = await supabase
        .from("conversations")
        .insert({
          kind: "group",
          title: input.title,
          description: input.description ?? null,
          created_by: userId!,
        })
        .select("id")
        .single();
      if (error) throw error;

      const rows = [
        { conversation_id: convo.id, user_id: userId!, role: "owner", accepted: true },
        ...input.memberIds.map((id) => ({
          conversation_id: convo.id,
          user_id: id,
          accepted: true,
        })),
      ];
      const { error: memberError } = await supabase.from("conversation_members").insert(rows);
      if (memberError) throw memberError;

      if (input.memberIds.length) {
        await supabase.from("notifications").insert(
          input.memberIds.map((id) => ({
            user_id: id,
            actor_id: userId!,
            conversation_id: convo.id,
            type: "group_invite",
            title: `Added to ${input.title}`,
            detail: "You were added to a new group",
          })),
        );
      }
      return convo.id;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chats"] }),
  });
}

/* ---------------------------------- friends ---------------------------------- */

export interface FriendEdge {
  id: string;
  status: "pending" | "accepted" | "blocked";
  note: string | null;
  incoming: boolean;
  createdAt: string;
  profile: EchoProfile;
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
      return (data ?? []).map((row) => {
        const incoming = row.addressee_id === userId;
        const other = incoming ? row.requester : row.addressee;
        return {
          id: row.id,
          status: row.status,
          note: row.note,
          incoming,
          createdAt: row.created_at,
          profile: toProfile(other as unknown as ProfileRow),
        };
      });
    },
  });
}

export function useSearchProfiles(term: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: ["profile-search", term, userId],
    enabled: !!userId && term.trim().length > 0,
    queryFn: async (): Promise<EchoProfile[]> => {
      const q = term.trim().replace(/^@/, "");
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
        .neq("id", userId!)
        .limit(20);
      if (error) throw error;
      return (data ?? []).map((r) => toProfile(r as ProfileRow));
    },
  });
}

export function useDiscoverProfiles() {
  const userId = useUserId();
  return useQuery({
    queryKey: ["discover", userId],
    enabled: !!userId,
    queryFn: async (): Promise<EchoProfile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .neq("id", userId!)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []).map((r) => toProfile(r as ProfileRow));
    },
  });
}

export function useSendFriendRequest() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; note?: string; displayName: string }) => {
      const { error } = await supabase.from("friendships").insert({
        requester_id: userId!,
        addressee_id: input.userId,
        note: input.note ?? null,
      });
      if (error) throw error;
      await supabase.from("notifications").insert({
        user_id: input.userId,
        actor_id: userId!,
        type: "friend_request",
        title: "New friend request",
        detail: input.note ?? "wants to connect on Echo",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friendships"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useRespondFriendRequest() {
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; accept: boolean; otherId: string }) => {
      if (!input.accept) {
        const { error } = await supabase.from("friendships").delete().eq("id", input.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("friendships")
        .update({ status: "accepted", updated_at: new Date().toISOString() })
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friendships"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

export function useUpdateFriendship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status?: "blocked" | "accepted"; remove?: boolean }) => {
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["friendships"] }),
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
