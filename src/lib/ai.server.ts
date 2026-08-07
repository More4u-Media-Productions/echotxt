// Server-only helpers for Echo's AI assistant. All reads go through the
// caller's RLS-scoped Supabase client, so the AI can only ever see what the
// signed-in user can already see.
import { generateText, streamText } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createLovableAiGatewayProvider, ECHO_AI_MODEL } from "./ai-gateway.server";

type Client = SupabaseClient<any, any, any>;

export function aiModel() {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured for this workspace.");
  return createLovableAiGatewayProvider(key)(ECHO_AI_MODEL);
}

/** Streams the call on the wire (avoids platform timeouts) but returns text. */
export async function runPrompt(input: {
  system: string;
  messages: Parameters<typeof streamText>[0]["messages"];
}): Promise<string> {
  const result = streamText({
    model: aiModel(),
    system: input.system,
    messages: input.messages as never,
  });
  return await result.text;
}

export interface TranscriptLine {
  id: string;
  author: string;
  createdAt: string;
  text: string;
}

export async function loadTranscript(
  supabase: Client,
  conversationId: string,
  limit: number,
  sinceIso?: string | null,
): Promise<{ title: string; lines: TranscriptLine[] }> {
  const { data: convo, error: convoError } = await supabase
    .from("conversations")
    .select("id, title, kind")
    .eq("id", conversationId)
    .maybeSingle();
  if (convoError) throw new Error(convoError.message);
  if (!convo) throw new Error("Conversation not found.");

  let query = supabase
    .from("messages")
    .select(
      "id, body, kind, created_at, attachment_name, deleted_at, sender_id, profiles!messages_sender_id_fkey(display_name, username)",
    )
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 10), 300));
  if (sinceIso) query = query.gt("created_at", sinceIso);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const lines: TranscriptLine[] = (data ?? [])
    .slice()
    .reverse()
    .map((row: Record<string, any>) => {
      const p = Array.isArray(row["profiles"]) ? row["profiles"][0] : row["profiles"];
      const kind = row["kind"] as string;
      const text =
        kind === "voice" || kind === "voicemail"
          ? "[voice message]"
          : row["attachment_name"]
            ? `[file: ${row["attachment_name"]}] ${row["body"] ?? ""}`.trim()
            : (row["body"] ?? "");
      return {
        id: row["id"] as string,
        author: (p?.display_name || p?.username || "Someone") as string,
        createdAt: row["created_at"] as string,
        text,
      };
    })
    .filter((line) => line.text.trim().length > 0);

  return { title: (convo as Record<string, any>)["title"] ?? "this conversation", lines };
}

export function renderTranscript(lines: TranscriptLine[]): string {
  return lines
    .map((l) => `[${new Date(l.createdAt).toLocaleString()}] ${l.author}: ${l.text}`)
    .join("\n");
}

/** Short-lived signed URL for a private chat-media object. */
export async function signAttachment(
  supabase: Client,
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage.from("chat-media").createSignedUrl(path, 600);
  if (error || !data?.signedUrl) throw new Error("You don't have access to that file.");
  return data.signedUrl;
}

export async function fetchAsDataUrl(url: string, mimeType: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't read that file.");
  const buffer = await res.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error("That file is empty.");
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export interface SearchPlan {
  terms: string;
  media: "all" | "text" | "image" | "video" | "audio" | "file";
  sender: string | null;
  days: number | null;
  explanation: string;
}

const SEARCH_SYSTEM = `You turn a natural-language search request from a chat app into search filters.
Reply with ONLY a JSON object, no markdown fences, using exactly these keys:
{"terms": string, "media": "all"|"text"|"image"|"video"|"audio"|"file", "sender": string|null, "days": number|null, "explanation": string}
- terms: the keywords to full-text search for (no names, no dates, no file words). May be an empty string.
- media: "file" for PDFs/documents, "image" for photos, "audio" for voice notes, "video" for clips, else "all".
- sender: a person's name or @username if one is mentioned, else null.
- days: how many days back to look if a timeframe is mentioned (yesterday = 1, last week = 7), else null.
- explanation: one short sentence describing the search you ran.`;

export async function planSearch(query: string): Promise<SearchPlan> {
  const { text } = await generateText({
    model: aiModel(),
    system: SEARCH_SYSTEM,
    prompt: query,
  });
  const raw = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    parsed = {};
  }
  const media = String(parsed["media"] ?? "all");
  return {
    terms: typeof parsed["terms"] === "string" ? parsed["terms"] : query,
    media: (["all", "text", "image", "video", "audio", "file"].includes(media)
      ? media
      : "all") as SearchPlan["media"],
    sender: typeof parsed["sender"] === "string" && parsed["sender"] ? parsed["sender"] : null,
    days: typeof parsed["days"] === "number" && parsed["days"] > 0 ? parsed["days"] : null,
    explanation:
      typeof parsed["explanation"] === "string" && parsed["explanation"]
        ? parsed["explanation"]
        : "Searched your messages.",
  };
}

/** Resolves a person's name/@username from a search plan to a profile id. */
export async function resolveSenderId(
  supabase: Client,
  name: string | null,
): Promise<string | null> {
  if (!name) return null;
  const clean = name.replace(/^@/, "").trim();
  if (clean.length < 2) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, username")
    .or(`display_name.ilike.%${clean}%,username.ilike.%${clean}%`)
    .limit(1);
  return (data?.[0]?.id as string | undefined) ?? null;
}
