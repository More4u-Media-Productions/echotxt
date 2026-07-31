import { useEffect, useState } from "react";
import {
  Mic,
  MicOff,
  PhoneOff,
  Video,
  VideoOff,
  Volume2,
  MonitorUp,
  Voicemail as VoicemailIcon,
  SwitchCamera,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EchoAvatar } from "./avatar";

export function CallOverlay({
  name,
  avatar,
  color,
  media,
  onClose,
  onVoicemail,
}: {
  name: string;
  avatar: string;
  color: string;
  media: "voice" | "video";
  onClose: () => void;
  onVoicemail?: (() => void) | undefined;
}) {
  const [state, setState] = useState<"ringing" | "connected" | "missed">("ringing");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(media === "voice");

  useEffect(() => {
    const t = setTimeout(() => setState("connected"), 2400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (state !== "connected") return;
    const i = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(i);
  }, [state]);

  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-foreground/95 px-6 py-12 text-background backdrop-blur-xl">
      <div className="flex flex-col items-center gap-4 pt-10 text-center">
        <EchoAvatar initials={avatar} color={color} size="xl" />
        <div>
          <p className="text-2xl font-semibold">{name}</p>
          <p className="mt-1 text-sm opacity-70">
            {state === "ringing"
              ? `Ringing · ${media === "video" ? "Video" : "HD voice"}`
              : state === "connected"
                ? `${clock} · ${media === "video" ? "Video call" : "HD voice"}`
                : "No answer"}
          </p>
        </div>
        {state === "missed" ? (
          <button
            onClick={() => {
              onVoicemail?.();
              toast("Recording voicemail…");
            }}
            className="mt-2 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <VoicemailIcon className="h-4 w-4" /> Leave a voicemail
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <CallButton
          active={muted}
          onClick={() => setMuted((m) => !m)}
          label={muted ? "Unmute" : "Mute"}
        >
          {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
        </CallButton>
        <CallButton onClick={() => toast("Speaker on")} label="Speaker">
          <Volume2 className="h-5 w-5" />
        </CallButton>
        {media === "video" ? (
          <>
            <CallButton
              active={camOff}
              onClick={() => setCamOff((c) => !c)}
              label={camOff ? "Camera on" : "Camera off"}
            >
              {camOff ? <VideoOff className="h-5 w-5" /> : <Video className="h-5 w-5" />}
            </CallButton>
            <CallButton onClick={() => toast("Camera switched")} label="Flip">
              <SwitchCamera className="h-5 w-5" />
            </CallButton>
            <CallButton onClick={() => toast("Screen sharing started")} label="Share">
              <MonitorUp className="h-5 w-5" />
            </CallButton>
          </>
        ) : null}
        <button
          onClick={() => (state === "ringing" ? setState("missed") : onClose())}
          className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lift transition-transform hover:scale-105"
          aria-label="End call"
        >
          <PhoneOff className="h-5 w-5" />
        </button>
        {state === "missed" ? (
          <button
            onClick={onClose}
            className="rounded-full border border-background/30 px-5 py-2.5 text-sm font-medium"
          >
            Close
          </button>
        ) : null}
      </div>
    </div>
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
