import { useEffect, useRef, useState } from "react";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  SwitchCamera,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EchoAvatar } from "./avatar";
import { useCallEngine, type RemotePeer } from "@/lib/calls";

/** Renders the incoming-call sheet and the active-call surface app-wide. */
export function CallLayer() {
  const { state, incoming } = useCallEngine();
  return (
    <>
      {incoming ? <IncomingCallSheet /> : null}
      {state.phase !== "idle" ? <ActiveCall /> : null}
    </>
  );
}

function IncomingCallSheet() {
  const { incoming, acceptIncoming, declineIncoming } = useCallEngine();
  if (!incoming) return null;
  const title = incoming.isGroup
    ? (incoming.conversationTitle ?? "Group call")
    : incoming.callerName;

  return (
    <div className="fixed inset-x-0 top-0 z-[60] flex justify-center p-3">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-4 shadow-lift animate-in slide-in-from-top-4">
        <div className="flex items-center gap-3">
          <EchoAvatar
            initials={incoming.callerAvatar}
            color={incoming.callerColor}
            {...(incoming.callerAvatarUrl ? { src: incoming.callerAvatarUrl } : {})}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {incoming.isGroup ? `${incoming.callerName} · ` : ""}
              Incoming {incoming.media === "video" ? "video" : "voice"} call
            </p>
          </div>
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
          </span>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => void declineIncoming()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-destructive px-4 py-2.5 text-sm font-semibold text-destructive-foreground"
          >
            <PhoneOff className="h-4 w-4" /> Decline
          </button>
          <button
            onClick={() => void acceptIncoming()}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            {incoming.media === "video" ? <Video className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}

function ActiveCall() {
  const { state, peers, localStream, hangUp, toggleMic, toggleCamera, switchCamera } =
    useCallEngine();
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (state.phase !== "connected" || !state.startedAt) return;
    const tick = () => setSeconds(Math.floor((Date.now() - state.startedAt!) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state.phase, state.startedAt]);

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const statusLine =
    state.phase === "calling"
      ? "Starting…"
      : state.phase === "ringing"
        ? "Ringing…"
        : state.phase === "connecting"
          ? "Connecting…"
          : state.phase === "connected"
            ? `${clock} · ${state.media === "video" ? "Video call" : "HD voice"}`
            : state.phase === "declined"
              ? "Call declined"
              : state.phase === "missed"
                ? "No answer"
                : state.phase === "failed"
                  ? (state.error ?? "Call failed")
                  : "Call ended";

  const withVideo = peers.filter((p) => p.stream?.getVideoTracks().length);
  const showVideoStage = state.media === "video" && (withVideo.length > 0 || state.camOn);

  return (
    <div className="fixed inset-0 z-[70] flex flex-col items-center justify-between bg-foreground/95 px-6 py-10 text-background backdrop-blur-xl">
      {showVideoStage ? (
        <div
          className={cn(
            "mt-2 grid w-full max-w-4xl flex-1 gap-2 overflow-hidden",
            withVideo.length > 1 ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {peers.map((peer) => (
            <RemoteTile key={peer.userId} peer={peer} />
          ))}
          {peers.length === 0 ? (
            <div className="grid place-items-center rounded-3xl bg-background/10 text-sm opacity-70">
              Waiting for others to join…
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <EchoAvatar
            initials={state.avatar}
            color={state.color}
            {...(state.avatarUrl ? { src: state.avatarUrl } : {})}
            size="xl"
          />
          <div>
            <p className="text-2xl font-semibold">{state.title}</p>
            <p className="mt-1 text-sm opacity-70">{statusLine}</p>
          </div>
          {peers.length > 0 ? (
            <p className="flex items-center gap-1.5 text-xs opacity-60">
              <Users className="h-3.5 w-3.5" /> {peers.length + 1} on the call
            </p>
          ) : null}
          {peers.map((peer) => (
            <AudioSink key={peer.userId} peer={peer} />
          ))}
        </div>
      )}

      {showVideoStage ? (
        <p className="pt-2 text-xs opacity-70">
          {state.title} · {statusLine}
        </p>
      ) : null}

      {localStream && state.media === "video" && state.camOn ? (
        <LocalPreview stream={localStream} />
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <CallButton active={!state.micOn} onClick={toggleMic} label={state.micOn ? "Mute" : "Unmute"}>
          {state.micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
        </CallButton>
        <CallButton
          active={!state.camOn}
          onClick={() => void toggleCamera()}
          label={state.camOn ? "Camera off" : "Camera on"}
        >
          {state.camOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
        </CallButton>
        {state.camOn ? (
          <CallButton onClick={() => void switchCamera()} label="Flip camera">
            <SwitchCamera className="h-5 w-5" />
          </CallButton>
        ) : null}
        <button
          onClick={() => void hangUp()}
          className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lift transition-transform hover:scale-105"
          aria-label="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function RemoteTile({ peer }: { peer: RemotePeer }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && peer.stream) ref.current.srcObject = peer.stream;
  }, [peer.stream]);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-background/10">
      <video
        ref={ref}
        autoPlay
        playsInline
        className="h-full w-full object-cover"
        aria-label="Remote participant video"
      />
      {peer.connection !== "connected" ? (
        <span className="absolute bottom-3 left-3 rounded-full bg-foreground/60 px-2.5 py-1 text-xs">
          Connecting…
        </span>
      ) : null}
    </div>
  );
}

/** Plays a peer's audio when there is no video stage on screen. */
function AudioSink({ peer }: { peer: RemotePeer }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && peer.stream) ref.current.srcObject = peer.stream;
  }, [peer.stream]);
  return <audio ref={ref} autoPlay className="hidden" />;
}

function LocalPreview({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      muted
      playsInline
      aria-label="Your camera preview"
      className="absolute bottom-28 right-5 h-40 w-28 rounded-2xl border border-background/20 object-cover shadow-lift"
    />
  );
}

function CallButton({
  children,
  onClick,
  label,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean | undefined;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cn(
        "grid h-14 w-14 place-items-center rounded-full transition-colors",
        active ? "bg-background text-foreground" : "bg-background/15 text-background",
      )}
    >
      {children}
    </button>
  );
}
