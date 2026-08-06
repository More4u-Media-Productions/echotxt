/**
 * Echo calling engine.
 *
 * Real WebRTC (mesh topology) with Supabase Realtime used for both signalling
 * and call-state synchronisation:
 *   - `calls`              — one row per call (status, duration, history)
 *   - `call_participants`  — per-user invitation/join state (drives ringing)
 *   - `call_signals`       — RLS-protected offer/answer/ICE envelopes
 *
 * Every state transition goes through a SECURITY DEFINER RPC so membership,
 * group permissions and blocks are enforced server-side.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useUserId } from "@/lib/session";
import { notifyCall } from "@/lib/push.functions";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: ["stun:global.stun.twilio.com:3478"] },
];

const RING_TIMEOUT_MS = 45_000;

export type CallMedia = "voice" | "video";
export type CallPhase =
  | "idle"
  | "calling"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "declined"
  | "missed"
  | "failed";

export interface RemotePeer {
  userId: string;
  stream: MediaStream | null;
  connection: RTCPeerConnectionState | "new";
}

export interface IncomingCall {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  callerAvatar: string;
  callerColor: string;
  callerAvatarUrl: string | null;
  conversationTitle: string | null;
  isGroup: boolean;
  media: CallMedia;
}

interface CallState {
  phase: CallPhase;
  callId: string | null;
  conversationId: string | null;
  media: CallMedia;
  outgoing: boolean;
  title: string;
  subtitle: string;
  avatar: string;
  avatarUrl: string | null;
  color: string;
  isGroup: boolean;
  micOn: boolean;
  camOn: boolean;
  error: string | null;
  startedAt: number | null;
}

const IDLE: CallState = {
  phase: "idle",
  callId: null,
  conversationId: null,
  media: "voice",
  outgoing: false,
  title: "",
  subtitle: "",
  avatar: "?",
  avatarUrl: null,
  color: "oklch(0.63 0.13 195)",
  isGroup: false,
  micOn: true,
  camOn: false,
  error: null,
  startedAt: null,
};

interface CallContextValue {
  state: CallState;
  incoming: IncomingCall | null;
  peers: RemotePeer[];
  localStream: MediaStream | null;
  startCall: (input: {
    conversationId: string;
    media: CallMedia;
    title: string;
    avatar: string;
    avatarUrl?: string | null;
    color?: string;
    isGroup?: boolean;
  }) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  declineIncoming: () => Promise<void>;
  hangUp: () => Promise<void>;
  toggleMic: () => void;
  toggleCamera: () => Promise<void>;
  switchCamera: () => Promise<void>;
}

const CallContext = createContext<CallContextValue | null>(null);

export function useCallEngine(): CallContextValue {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCallEngine must be used inside <CallProvider>");
  return ctx;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  pendingIce: RTCIceCandidateInit[];
}

export function CallProvider({ children }: { children: ReactNode }) {
  const userId = useUserId();
  const queryClient = useQueryClient();

  const [state, setState] = useState<CallState>(IDLE);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [peers, setPeers] = useState<RemotePeer[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peersRef = useRef(new Map<string, PeerEntry>());
  const localRef = useRef<MediaStream | null>(null);
  const callIdRef = useRef<string | null>(null);
  const facingRef = useRef<"user" | "environment">("user");
  const ringTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ------------------------------- signalling ------------------------------ */

  const sendSignal = useCallback(
    async (to: string, kind: "offer" | "answer" | "ice" | "bye", payload: unknown) => {
      const callId = callIdRef.current;
      if (!callId || !userId) return;
      const { error } = await supabase.from("call_signals").insert({
        call_id: callId,
        from_user: userId,
        to_user: to,
        kind,
        payload: payload as never,
      });
      if (error) console.warn("[call] signal failed", error.message);
    },
    [userId],
  );

  const updatePeerState = useCallback((peerId: string, patch: Partial<RemotePeer>) => {
    setPeers((prev) => {
      const existing = prev.find((p) => p.userId === peerId);
      if (!existing) {
        return [...prev, { userId: peerId, stream: null, connection: "new", ...patch }];
      }
      return prev.map((p) => (p.userId === peerId ? { ...p, ...patch } : p));
    });
  }, []);

  const getPeer = useCallback(
    (peerId: string): PeerEntry => {
      const found = peersRef.current.get(peerId);
      if (found) return found;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const entry: PeerEntry = {
        pc,
        // Deterministic roles avoid offer glare: lower uuid is the offerer.
        polite: (userId ?? "") > peerId,
        makingOffer: false,
        pendingIce: [],
      };
      peersRef.current.set(peerId, entry);

      const stream = localRef.current;
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      pc.onicecandidate = (event) => {
        if (event.candidate) void sendSignal(peerId, "ice", event.candidate.toJSON());
      };
      pc.ontrack = (event) => {
        const [remote] = event.streams;
        if (remote) updatePeerState(peerId, { stream: remote });
      };
      pc.onconnectionstatechange = () => {
        updatePeerState(peerId, { connection: pc.connectionState });
        if (pc.connectionState === "connected") {
          setState((s) =>
            s.phase === "connected"
              ? s
              : { ...s, phase: "connected", startedAt: s.startedAt ?? Date.now() },
          );
        }
        if (pc.connectionState === "failed") {
          // Network flip / temporary loss — try an ICE restart before giving up.
          try {
            pc.restartIce();
          } catch {
            /* not supported */
          }
        }
      };

      updatePeerState(peerId, {});
      return entry;
    },
    [sendSignal, updatePeerState, userId],
  );

  const negotiate = useCallback(
    async (peerId: string) => {
      const entry = getPeer(peerId);
      if (entry.polite) return; // the impolite side always creates the offer
      try {
        entry.makingOffer = true;
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        await sendSignal(peerId, "offer", entry.pc.localDescription?.toJSON());
      } catch (error) {
        console.warn("[call] negotiation failed", error);
      } finally {
        entry.makingOffer = false;
      }
    },
    [getPeer, sendSignal],
  );

  const handleSignal = useCallback(
    async (row: { from_user: string; kind: string; payload: unknown; call_id: string }) => {
      if (row.call_id !== callIdRef.current) return;
      const peerId = row.from_user;

      if (row.kind === "bye") {
        peersRef.current.get(peerId)?.pc.close();
        peersRef.current.delete(peerId);
        setPeers((prev) => prev.filter((p) => p.userId !== peerId));
        return;
      }

      const entry = getPeer(peerId);
      const pc = entry.pc;
      try {
        if (row.kind === "offer") {
          const collision = entry.makingOffer || pc.signalingState !== "stable";
          if (collision && !entry.polite) return;
          if (collision) await pc.setLocalDescription({ type: "rollback" } as RTCSessionDescriptionInit);
          await pc.setRemoteDescription(new RTCSessionDescription(row.payload as RTCSessionDescriptionInit));
          for (const candidate of entry.pendingIce.splice(0)) {
            await pc.addIceCandidate(candidate).catch(() => undefined);
          }
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(peerId, "answer", pc.localDescription?.toJSON());
        } else if (row.kind === "answer") {
          if (pc.signalingState !== "have-local-offer") return;
          await pc.setRemoteDescription(new RTCSessionDescription(row.payload as RTCSessionDescriptionInit));
          for (const candidate of entry.pendingIce.splice(0)) {
            await pc.addIceCandidate(candidate).catch(() => undefined);
          }
        } else if (row.kind === "ice") {
          const candidate = row.payload as RTCIceCandidateInit;
          if (!pc.remoteDescription) entry.pendingIce.push(candidate);
          else await pc.addIceCandidate(candidate).catch(() => undefined);
        }
      } catch (error) {
        console.warn("[call] signal handling failed", error);
      }
    },
    [getPeer, sendSignal],
  );

  /* --------------------------------- media --------------------------------- */

  const acquireMedia = useCallback(async (media: CallMedia): Promise<MediaStream> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser doesn't support calling.");
    }
    const constraints: MediaStreamConstraints = {
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        media === "video"
          ? { facingMode: facingRef.current, width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
    };
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      localRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (error) {
      const name = (error as DOMException)?.name;
      if (name === "NotAllowedError" || name === "SecurityError") {
        throw new Error(
          media === "video"
            ? "Camera and microphone access was blocked. Allow it in your browser settings to call."
            : "Microphone access was blocked. Allow it in your browser settings to call.",
        );
      }
      if (name === "NotFoundError" || name === "OverconstrainedError") {
        if (media === "video") {
          // No camera — fall back to an audio-only call rather than failing.
          const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
          localRef.current = audioOnly;
          setLocalStream(audioOnly);
          toast("No camera found — continuing with audio only");
          return audioOnly;
        }
        throw new Error("No microphone was found on this device.");
      }
      throw new Error("Couldn't start your microphone or camera.");
    }
  }, []);

  /* -------------------------------- teardown -------------------------------- */

  const teardown = useCallback(
    (phase: CallPhase, error?: string) => {
      for (const [, entry] of peersRef.current) entry.pc.close();
      peersRef.current.clear();
      setPeers([]);
      localRef.current?.getTracks().forEach((t) => t.stop());
      localRef.current = null;
      setLocalStream(null);
      callIdRef.current = null;
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
      setState((s) => ({ ...IDLE, phase, error: error ?? null, media: s.media }));
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      setTimeout(() => setState((s) => (s.phase === phase ? IDLE : s)), 2600);
    },
    [queryClient],
  );

  const hangUp = useCallback(async () => {
    const callId = callIdRef.current;
    const others = [...peersRef.current.keys()];
    if (callId) {
      await Promise.all(others.map((id) => sendSignal(id, "bye", {})));
      await supabase.rpc("leave_call", { _call: callId });
    }
    teardown("ended");
  }, [sendSignal, teardown]);

  /* ------------------------- per-call realtime channel ---------------------- */

  useEffect(() => {
    const callId = state.callId;
    if (!callId || !userId) return;

    const syncParticipants = async () => {
      const { data } = await supabase
        .from("call_participants")
        .select("user_id, state")
        .eq("call_id", callId);
      const joined = (data ?? []).filter((p) => p.state === "joined").map((p) => p.user_id);

      for (const peerId of joined) {
        if (peerId === userId) continue;
        if (!peersRef.current.has(peerId)) {
          getPeer(peerId);
          void negotiate(peerId);
        }
      }
      // Anyone who left or declined drops out of the mesh immediately.
      for (const peerId of [...peersRef.current.keys()]) {
        if (!joined.includes(peerId)) {
          peersRef.current.get(peerId)?.pc.close();
          peersRef.current.delete(peerId);
          setPeers((prev) => prev.filter((p) => p.userId !== peerId));
        }
      }
      if (joined.length > 1) {
        setState((s) => (s.phase === "calling" || s.phase === "ringing" ? { ...s, phase: "connecting" } : s));
      }
    };

    void syncParticipants();

    const channel = supabase
      .channel(`call:${callId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_participants", filter: `call_id=eq.${callId}` },
        () => void syncParticipants(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${callId}` },
        (payload) => {
          const row = payload.new as { ended_at: string | null; status: string };
          if (row.ended_at) {
            teardown(row.status === "declined" ? "declined" : row.status === "missed" ? "missed" : "ended");
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state.callId, userId, getPeer, negotiate, teardown]);

  /* ------------------- personal channel: incoming + signals ----------------- */

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`call-inbox:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "call_signals", filter: `to_user=eq.${userId}` },
        (payload) => {
          const row = payload.new as {
            id: string;
            from_user: string;
            kind: string;
            payload: unknown;
            call_id: string;
          };
          void handleSignal(row);
          void supabase.from("call_signals").delete().eq("id", row.id);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "call_participants",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { call_id: string; state: string };
          if (row.state !== "invited") return;
          void presentIncoming(row.call_id);
        },
      )
      .subscribe();

    async function presentIncoming(callId: string) {
      if (callIdRef.current) return; // already busy
      const { data: call } = await supabase
        .from("calls")
        .select("id, conversation_id, caller_id, media, status, ended_at")
        .eq("id", callId)
        .maybeSingle();
      if (!call || call.ended_at) return;

      const [{ data: caller }, { data: convo }] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, username, avatar_color, avatar_url")
          .eq("id", call.caller_id)
          .maybeSingle(),
        supabase
          .from("conversations")
          .select("kind, title, avatar_color")
          .eq("id", call.conversation_id)
          .maybeSingle(),
      ]);

      const isGroup = convo?.kind === "group";
      const name = caller?.display_name || caller?.username || "Someone";
      setIncoming({
        callId: call.id,
        conversationId: call.conversation_id,
        callerId: call.caller_id,
        callerName: name,
        callerAvatar: name.slice(0, 2).toUpperCase(),
        callerColor: (isGroup ? convo?.avatar_color : caller?.avatar_color) || IDLE.color,
        callerAvatarUrl: caller?.avatar_url ?? null,
        conversationTitle: convo?.title ?? null,
        isGroup,
        media: call.media,
      });

      if (incomingTimerRef.current) clearTimeout(incomingTimerRef.current);
      incomingTimerRef.current = setTimeout(() => {
        setIncoming((cur) => (cur?.callId === callId ? null : cur));
        void queryClient.invalidateQueries({ queryKey: ["calls"] });
      }, RING_TIMEOUT_MS);
    }

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, handleSignal, queryClient]);

  // Incoming invite is cancelled when the call row ends.
  useEffect(() => {
    if (!incoming) return;
    const channel = supabase
      .channel(`call-watch:${incoming.callId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "calls", filter: `id=eq.${incoming.callId}` },
        (payload) => {
          if ((payload.new as { ended_at: string | null }).ended_at) {
            setIncoming(null);
            void queryClient.invalidateQueries({ queryKey: ["calls"] });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [incoming, queryClient]);

  /* --------------------------------- actions -------------------------------- */

  const startCall = useCallback<CallContextValue["startCall"]>(
    async (input) => {
      if (callIdRef.current) {
        toast("You're already in a call");
        return;
      }
      setState({
        ...IDLE,
        phase: "calling",
        conversationId: input.conversationId,
        media: input.media,
        outgoing: true,
        title: input.title,
        subtitle: input.media === "video" ? "Video call" : "Voice call",
        avatar: input.avatar,
        avatarUrl: input.avatarUrl ?? null,
        color: input.color ?? IDLE.color,
        isGroup: !!input.isGroup,
        camOn: input.media === "video",
      });

      try {
        await acquireMedia(input.media);
      } catch (error) {
        teardown("failed", (error as Error).message);
        toast.error((error as Error).message);
        return;
      }

      const { data: callId, error } = await supabase.rpc("start_call", {
        _cid: input.conversationId,
        _media: input.media,
      });
      if (error || !callId) {
        teardown("failed", error?.message ?? "Couldn't start the call");
        toast.error(error?.message ?? "Couldn't start the call");
        return;
      }

      callIdRef.current = callId;
      setState((s) => ({ ...s, callId, phase: "ringing" }));

      void notifyCall({
        data: {
          conversationId: input.conversationId,
          media: input.media,
          kind: "incoming",
        },
      }).catch(() => undefined);

      ringTimerRef.current = setTimeout(() => {
        if (peersRef.current.size === 0) {
          void supabase.rpc("end_call", { _call: callId });
          void notifyCall({
            data: { conversationId: input.conversationId, media: input.media, kind: "missed" },
          }).catch(() => undefined);
          teardown("missed");
          toast("No answer");
        }
      }, RING_TIMEOUT_MS);
    },
    [acquireMedia, teardown],
  );

  const acceptIncoming = useCallback(async () => {
    const call = incoming;
    if (!call) return;
    setIncoming(null);
    setState({
      ...IDLE,
      phase: "connecting",
      callId: call.callId,
      conversationId: call.conversationId,
      media: call.media,
      outgoing: false,
      title: call.isGroup ? (call.conversationTitle ?? "Group call") : call.callerName,
      subtitle: call.isGroup ? `${call.callerName} is calling` : call.media === "video" ? "Video call" : "Voice call",
      avatar: call.callerAvatar,
      avatarUrl: call.callerAvatarUrl,
      color: call.callerColor,
      isGroup: call.isGroup,
      camOn: call.media === "video",
    });

    try {
      await acquireMedia(call.media);
    } catch (error) {
      await supabase.rpc("decline_call", { _call: call.callId });
      teardown("failed", (error as Error).message);
      toast.error((error as Error).message);
      return;
    }

    const { error } = await supabase.rpc("join_call", { _call: call.callId });
    if (error) {
      teardown("failed", error.message);
      toast.error(error.message);
      return;
    }
    callIdRef.current = call.callId;
    setState((s) => ({ ...s, callId: call.callId }));
  }, [incoming, acquireMedia, teardown]);

  const declineIncoming = useCallback(async () => {
    const call = incoming;
    if (!call) return;
    setIncoming(null);
    await supabase.rpc("decline_call", { _call: call.callId });
    void queryClient.invalidateQueries({ queryKey: ["calls"] });
  }, [incoming, queryClient]);

  const toggleMic = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    const next = !stream.getAudioTracks().every((t) => t.enabled);
    stream.getAudioTracks().forEach((t) => (t.enabled = next));
    setState((s) => ({ ...s, micOn: next }));
  }, []);

  const toggleCamera = useCallback(async () => {
    const stream = localRef.current;
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) {
      // Upgrading a voice call to video: add a camera track to every peer.
      try {
        const cam = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: facingRef.current },
        });
        const track = cam.getVideoTracks()[0];
        if (!track) return;
        stream.addTrack(track);
        for (const [peerId, entry] of peersRef.current) {
          entry.pc.addTrack(track, stream);
          void negotiate(peerId);
        }
        setState((s) => ({ ...s, camOn: true, media: "video" }));
        setLocalStream(new MediaStream(stream.getTracks()));
      } catch {
        toast.error("Couldn't turn on your camera");
      }
      return;
    }
    const next = !tracks.every((t) => t.enabled);
    tracks.forEach((t) => (t.enabled = next));
    setState((s) => ({ ...s, camOn: next }));
  }, [negotiate]);

  const switchCamera = useCallback(async () => {
    const stream = localRef.current;
    if (!stream) return;
    facingRef.current = facingRef.current === "user" ? "environment" : "user";
    try {
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingRef.current },
      });
      const track = fresh.getVideoTracks()[0];
      if (!track) return;
      for (const [, entry] of peersRef.current) {
        const sender = entry.pc.getSenders().find((s) => s.track?.kind === "video");
        if (sender) await sender.replaceTrack(track);
      }
      stream.getVideoTracks().forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(track);
      setLocalStream(new MediaStream(stream.getTracks()));
    } catch {
      toast("No other camera available");
    }
  }, []);

  // Leaving the page during a call must still end it for everyone else.
  useEffect(() => {
    const onUnload = () => {
      const callId = callIdRef.current;
      if (callId) void supabase.rpc("leave_call", { _call: callId });
    };
    window.addEventListener("pagehide", onUnload);
    return () => window.removeEventListener("pagehide", onUnload);
  }, []);

  const value = useMemo<CallContextValue>(
    () => ({
      state,
      incoming,
      peers,
      localStream,
      startCall,
      acceptIncoming,
      declineIncoming,
      hangUp,
      toggleMic,
      toggleCamera,
      switchCamera,
    }),
    [
      state,
      incoming,
      peers,
      localStream,
      startCall,
      acceptIncoming,
      declineIncoming,
      hangUp,
      toggleMic,
      toggleCamera,
      switchCamera,
    ],
  );

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
