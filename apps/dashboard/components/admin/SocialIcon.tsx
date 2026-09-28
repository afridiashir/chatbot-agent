import { AtSign, Ghost, Globe, MessageCircle, Send } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Lucide dropped its brand icons, so the common platforms are drawn here as
 * simple glyphs on their brand colour. Anything not recognised still gets a
 * circle, with a globe, so an unusual platform is never left off the card.
 */

type Glyph = React.ComponentType<{ className?: string }>;

function svg(children: React.ReactNode, fill = true): Glyph {
  function BrandGlyph({ className }: { className?: string }) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={className}
        fill={fill ? "currentColor" : "none"}
        stroke={fill ? "none" : "currentColor"}
        strokeWidth={fill ? undefined : 2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    );
  }
  return BrandGlyph;
}

interface Platform {
  label: string;
  /** Background of the circle; the glyph is drawn in `text`. */
  background: string;
  text: string;
  Glyph: Glyph;
}

const PLATFORMS: Record<string, Platform> = {
  facebook: {
    label: "Facebook",
    background: "bg-[#1877F2]",
    text: "text-white",
    Glyph: svg(
      <path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H7.9v3h2.6V21z" />,
    ),
  },
  instagram: {
    label: "Instagram",
    background: "bg-[linear-gradient(45deg,#F58529,#DD2A7B_50%,#8134AF)]",
    text: "text-white",
    Glyph: svg(
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" />
      </>,
      false,
    ),
  },
  tiktok: {
    label: "TikTok",
    background: "bg-black",
    text: "text-white",
    Glyph: svg(
      <path d="M16.5 3c.3 2.2 1.7 3.6 4 3.8v3c-1.5.1-2.8-.4-4-1.2v6.1a5.7 5.7 0 1 1-5.7-5.7c.3 0 .6 0 .9.1v3.1a2.7 2.7 0 1 0 1.8 2.5V3z" />,
    ),
  },
  x: {
    label: "X",
    background: "bg-black",
    text: "text-white",
    Glyph: svg(
      <>
        <path d="M4.5 4h4l11 16h-4z" fill="currentColor" stroke="none" />
        <path d="M19 4l-6.4 7.3M11.4 12.7 5 20" />
      </>,
      false,
    ),
  },
  youtube: {
    label: "YouTube",
    background: "bg-[#FF0000]",
    text: "text-white",
    Glyph: svg(
      <>
        <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
        <path d="M10 9.2v5.6l4.8-2.8z" className="fill-[#FF0000]" />
      </>,
    ),
  },
  linkedin: {
    label: "LinkedIn",
    background: "bg-[#0A66C2]",
    text: "text-white",
    Glyph: svg(
      <path d="M7 9.5v9H4v-9zM5.5 4.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10 9.5h2.9v1.3c.4-.8 1.5-1.5 3-1.5 3 0 3.6 2 3.6 4.5v4.7h-3v-4.2c0-1.1 0-2.4-1.5-2.4s-1.8 1.1-1.8 2.3v4.3H10z" />,
    ),
  },
  whatsapp: {
    label: "WhatsApp",
    background: "bg-[#25D366]",
    text: "text-white",
    Glyph: MessageCircle,
  },
  snapchat: {
    label: "Snapchat",
    background: "bg-[#FFFC00]",
    text: "text-black",
    Glyph: Ghost,
  },
  telegram: {
    label: "Telegram",
    background: "bg-[#26A5E4]",
    text: "text-white",
    Glyph: Send,
  },
  threads: {
    label: "Threads",
    background: "bg-black",
    text: "text-white",
    Glyph: AtSign,
  },
};

/** The spellings people actually type, mapped to one platform. */
const ALIASES: Record<string, string> = {
  fb: "facebook",
  insta: "instagram",
  ig: "instagram",
  twitter: "x",
  yt: "youtube",
  wa: "whatsapp",
  snap: "snapchat",
};

/** What the platform field suggests, so the names match an icon. */
export const SUGGESTED_PLATFORMS = Object.values(PLATFORMS).map((platform) => platform.label);

function platformOf(name: string): Platform | null {
  const key = name.toLowerCase().replace(/[^a-z]/g, "");
  return PLATFORMS[ALIASES[key] ?? key] ?? null;
}

/** A platform as a round icon in its brand colour. */
export function SocialIcon({
  platform,
  size = "md",
  className,
}: {
  platform: string;
  size?: "md" | "lg";
  className?: string;
}) {
  const known = platformOf(platform);
  const Glyph = known?.Glyph ?? Globe;
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "md" ? "size-8" : "size-11",
        known ? [known.background, known.text] : "bg-muted text-muted-foreground",
        className,
      )}
    >
      <Glyph className={size === "md" ? "size-4" : "size-5"} />
    </span>
  );
}
