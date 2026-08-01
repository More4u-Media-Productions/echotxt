import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * A single shared presence channel that tracks which Echo users are currently
 * connected. Used to derive the "delivered" state of a sent message.
 */

type Listener = () => void;

let onlineIds: string[] = [];
const listeners = new Set<Listener>();
let channel: ReturnType<typeof supabase.channel> | null = null;
let refCount = 0;

function emit(next: string[]) {
  const changed =
    next.length !== onlineIds.length || next.some((id, i) => id !== onlineIds[i]);
  if (!changed) return;
  onlineIds = next;
  for (const l of listeners) l();
}

function join(userId: string) {
  refCount += 1;
  if (channel) return;
  channel = supabase.channel("echo-online", { config: { presence: { key: userId } } });
  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel!.presenceState();
      emit(Object.keys(state).sort());
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel!.track({ at: new Date().toISOString() });
      }
    });
}

function leave() {
  refCount -= 1;
  if (refCount > 0 || !channel) return;
  const c = channel;
  channel = null;
  emit([]);
  void supabase.removeChannel(c);
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return onlineIds;
}

const EMPTY: string[] = [];

/** Publishes our presence and returns the ids of everyone currently connected. */
export function useOnlineUsers(userId: string | null): string[] {
  useEffect(() => {
    if (!userId) return;
    join(userId);
    return () => leave();
  }, [userId]);
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
}

/**
 * Ephemeral typing indicators for one conversation, over Realtime broadcast.
 * Nothing is persisted, so no table or policy is involved.
 */
export function useTyping(conversationId: string | null, me: { id: string; name: string } | null) {
  const [typing, setTyping] = useState<string[]>([]);
  const chanRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const lastSent = useRef(0);

  useEffect(() => {
    if (!conversationId || !me) return;
    const names = new Map<string, string>();
    const localTimers = timers.current;

    const c = supabase.channel(`typing:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    c.on("broadcast", { event: "typing" }, ({ payload }) => {
      const p = payload as { userId: string; name: string; stopped?: boolean };
      if (!p?.userId || p.userId === me.id) return;
      const existing = localTimers.get(p.userId);
      if (existing) clearTimeout(existing);

      if (p.stopped) {
        names.delete(p.userId);
        localTimers.delete(p.userId);
        setTyping([...names.values()]);
        return;
      }

      names.set(p.userId, p.name);
      setTyping([...names.values()]);
      localTimers.set(
        p.userId,
        setTimeout(() => {
          names.delete(p.userId);
          localTimers.delete(p.userId);
          setTyping([...names.values()]);
        }, 4000),
      );
    }).subscribe();

    chanRef.current = c;
    return () => {
      chanRef.current = null;
      for (const t of localTimers.values()) clearTimeout(t);
      localTimers.clear();
      setTyping([]);
      void supabase.removeChannel(c);
    };
  }, [conversationId, me?.id, me?.name]);

  const notifyTyping = useCallback(() => {
    const c = chanRef.current;
    if (!c || !me) return;
    const now = Date.now();
    if (now - lastSent.current < 1500) return;
    lastSent.current = now;
    void c.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me.id, name: me.name },
    });
  }, [me?.id, me?.name]);

  const stopTyping = useCallback(() => {
    const c = chanRef.current;
    if (!c || !me) return;
    lastSent.current = 0;
    void c.send({
      type: "broadcast",
      event: "typing",
      payload: { userId: me.id, name: me.name, stopped: true },
    });
  }, [me?.id, me?.name]);

  return { typing, notifyTyping, stopTyping };
}
