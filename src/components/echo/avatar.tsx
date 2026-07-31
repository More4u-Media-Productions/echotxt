import { cn } from "@/lib/utils";
import type { Presence } from "@/lib/echo-data";

const sizes = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-11 w-11 text-sm",
  lg: "h-14 w-14 text-base",
  xl: "h-24 w-24 text-2xl",
};

export function EchoAvatar({
  initials,
  color,
  avatarUrl,
  presence,
  size = "md",
  square,
  className,
}: {
  initials: string;
  color: string;
  avatarUrl?: string | null | undefined;
  presence?: Presence | undefined;
  size?: keyof typeof sizes | undefined;
  square?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      <span
        className={cn(
          "inline-flex items-center justify-center font-semibold tracking-tight text-white/95",
          square ? "rounded-2xl" : "rounded-full",
          sizes[size],
        )}
        style={{
          background: `linear-gradient(150deg, ${color}, color-mix(in oklab, ${color} 62%, black))`,
        }}
        aria-hidden="true"
      >
        {initials}
      </span>
      {presence ? (
        <span
          className={cn(
            "absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-background",
            size === "sm" ? "h-2.5 w-2.5" : "h-3.5 w-3.5",
            presence === "online" && "bg-success",
            presence === "away" && "bg-warning",
            presence === "offline" && "bg-muted-foreground/50",
          )}
        />
      ) : null}
    </span>
  );
}

export function PresenceLabel({ presence, lastSeen }: { presence: Presence; lastSeen: string }) {
  const text =
    presence === "online" ? "Online" : presence === "away" ? "Away" : `Last seen ${lastSeen}`;
  return <span className="text-xs text-muted-foreground">{text}</span>;
}
