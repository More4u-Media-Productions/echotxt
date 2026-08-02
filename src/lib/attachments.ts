// Attachment helpers for Echo: validation, uploads (with progress + cancel)
// and signed-URL resolution for the private `chat-media` bucket.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "chat-media";
export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
export const MAX_FILES_PER_MESSAGE = 5;

export type AttachmentKind = "image" | "video" | "audio" | "pdf" | "file";

const DOC_EXTENSIONS = [
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "txt",
  "csv",
  "md",
  "rtf",
  "json",
  "zip",
];

export function attachmentKind(type: string | null, name?: string | null): AttachmentKind {
  const mime = (type ?? "").toLowerCase();
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  const ext = (name ?? "").split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  return "file";
}

export function isAllowedFile(file: File): boolean {
  const kind = attachmentKind(file.type, file.name);
  if (kind !== "file") return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return DOC_EXTENSIONS.includes(ext);
}

export function validateFile(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty.`;
  if (file.size > MAX_FILE_BYTES)
    return `${file.name} is ${formatBytes(file.size)} — the limit is ${formatBytes(MAX_FILE_BYTES)}.`;
  if (!isAllowedFile(file)) return `${file.name} isn't a supported file type.`;
  return null;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
}

function extensionOf(file: File): string {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 8 && /^[a-zA-Z0-9]+$/.test(fromName)) return fromName.toLowerCase();
  const fromMime = file.type.split("/")[1];
  return fromMime && /^[a-zA-Z0-9]+$/.test(fromMime) ? fromMime.toLowerCase() : "bin";
}

export function storagePath(conversationId: string, userId: string, file: File): string {
  return `${conversationId}/${userId}/${crypto.randomUUID()}.${extensionOf(file)}`;
}

/**
 * Uploads straight to the Storage REST endpoint so we get real upload progress
 * and cancellation, which supabase-js does not expose.
 */
export function uploadAttachment(options: {
  path: string;
  file: File;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}): Promise<void> {
  const { path, file, onProgress, signal } = options;
  return new Promise<void>((resolve, reject) => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        reject(new Error("You need to be signed in to upload files."));
        return;
      }
      const baseUrl = import.meta.env['VITE_SUPABASE_URL'] as string;
      const apiKey = import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] as string;
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseUrl}/storage/v1/object/${BUCKET}/${path}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", apiKey);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "3600");
      if (file.type) xhr.setRequestHeader("content-type", file.type);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
      };
      xhr.onerror = () => reject(new Error("Upload failed — check your connection."));
      xhr.onabort = () => reject(new DOMException("Upload cancelled", "AbortError"));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(100);
          resolve();
        } else if (xhr.status === 403) {
          reject(new Error("You don't have permission to upload to this conversation."));
        } else {
          reject(new Error(`Upload failed (${xhr.status}).`));
        }
      };
      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          return;
        }
        signal.addEventListener("abort", () => xhr.abort(), { once: true });
      }
      xhr.send(file);
    })().catch(reject);
  });
}

export async function removeAttachment(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}

const SIGNED_TTL = 60 * 60; // 1 hour
const signedCache = new Map<string, { url: string; expires: number }>();

export async function signedUrl(path: string): Promise<string | null> {
  const cached = signedCache.get(path);
  if (cached && cached.expires > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data?.signedUrl) return null;
  signedCache.set(path, { url: data.signedUrl, expires: Date.now() + (SIGNED_TTL - 300) * 1000 });
  return data.signedUrl;
}

/** Resolves a storage path to a temporary signed URL (cached per path). */
export function useSignedUrl(path: string | null): { url: string | null; loading: boolean } {
  const [url, setUrl] = useState<string | null>(() =>
    path ? (signedCache.get(path)?.url ?? null) : null,
  );
  const [loading, setLoading] = useState(!!path && !url);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      setLoading(false);
      return;
    }
    const cached = signedCache.get(path);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    void signedUrl(path).then((resolved) => {
      if (!active) return;
      setUrl(resolved);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [path]);

  return { url, loading };
}

export async function downloadAttachment(path: string, name: string): Promise<void> {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error || !data) throw error ?? new Error("Download failed");
  const href = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = href;
  link.download = name || "download";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}
