// Pending-upload manager for the message composer: uploads start as soon as a
// file is attached, so sending is instant once uploads finish.

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import {
  MAX_FILES_PER_MESSAGE,
  removeAttachment,
  storagePath,
  uploadAttachment,
  validateFile,
} from "@/lib/attachments";

export interface PendingUpload {
  id: string;
  file: File;
  path: string;
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "error" | "cancelled";
  error: string | null;
}

export function useUploads(conversationId: string, userId: string | null) {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const controllers = useRef(new Map<string, AbortController>());

  const patch = useCallback((id: string, changes: Partial<PendingUpload>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }, []);

  const start = useCallback(
    (item: PendingUpload) => {
      const controller = new AbortController();
      controllers.current.set(item.id, controller);
      patch(item.id, { status: "uploading", progress: 0, error: null });
      void uploadAttachment({
        path: item.path,
        file: item.file,
        signal: controller.signal,
        onProgress: (percent) => patch(item.id, { progress: percent }),
      })
        .then(() => patch(item.id, { status: "done", progress: 100 }))
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          const message = error instanceof Error ? error.message : "Upload failed";
          patch(item.id, { status: "error", error: message });
        })
        .finally(() => controllers.current.delete(item.id));
    },
    [patch],
  );

  const add = useCallback(
    (files: File[] | FileList) => {
      if (!userId) return;
      const incoming = Array.from(files);
      setItems((list) => {
        const room = MAX_FILES_PER_MESSAGE - list.length;
        if (room <= 0) {
          toast.error(`You can attach up to ${MAX_FILES_PER_MESSAGE} files per message.`);
          return list;
        }
        const accepted: PendingUpload[] = [];
        for (const file of incoming.slice(0, room)) {
          const problem = validateFile(file);
          if (problem) {
            toast.error(problem);
            continue;
          }
          accepted.push({
            id: crypto.randomUUID(),
            file,
            path: storagePath(conversationId, userId, file),
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
            progress: 0,
            status: "uploading",
            error: null,
          });
        }
        if (incoming.length > room) {
          toast.error(`Only ${room} more file${room === 1 ? "" : "s"} can be attached.`);
        }
        accepted.forEach((item) => start(item));
        return [...list, ...accepted];
      });
    },
    [conversationId, start, userId],
  );

  const cancel = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    setItems((list) => {
      const item = list.find((it) => it.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      if (item?.status === "done") void removeAttachment(item.path);
      return list.filter((it) => it.id !== id);
    });
  }, []);

  const retry = useCallback(
    (id: string) => {
      setItems((list) => {
        const item = list.find((it) => it.id === id);
        if (item) start(item);
        return list;
      });
    },
    [start],
  );

  const clear = useCallback(() => {
    controllers.current.forEach((c) => c.abort());
    controllers.current.clear();
    setItems((list) => {
      list.forEach((it) => it.previewUrl && URL.revokeObjectURL(it.previewUrl));
      return [];
    });
  }, []);

  const ready = items.filter((it) => it.status === "done");
  const busy = items.some((it) => it.status === "uploading");

  return { items, add, cancel, retry, clear, ready, busy };
}
