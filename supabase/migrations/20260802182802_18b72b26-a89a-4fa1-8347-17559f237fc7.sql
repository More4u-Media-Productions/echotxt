ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_size bigint;

CREATE OR REPLACE FUNCTION public.safe_uuid(_t text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN _t::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "chat_media_insert" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_select" ON storage.objects;
DROP POLICY IF EXISTS "chat_media_delete" ON storage.objects;

CREATE POLICY "chat_media_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[2] = auth.uid()::text
  AND public.is_member(public.safe_uuid((storage.foldername(name))[1]), auth.uid())
);

CREATE POLICY "chat_media_select" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-media'
  AND public.is_member(public.safe_uuid((storage.foldername(name))[1]), auth.uid())
);

CREATE POLICY "chat_media_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-media'
  AND (storage.foldername(name))[2] = auth.uid()::text
);

CREATE OR REPLACE FUNCTION public.cleanup_message_attachment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF old.attachment_url IS NOT NULL AND old.attachment_url <> '' THEN
    DELETE FROM storage.objects
    WHERE bucket_id = 'chat-media' AND name = old.attachment_url;
  END IF;
  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS messages_cleanup_attachment ON public.messages;
CREATE TRIGGER messages_cleanup_attachment
AFTER DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.cleanup_message_attachment();