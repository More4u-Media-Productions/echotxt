CREATE OR REPLACE FUNCTION public.start_dm(_other uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  me uuid := auth.uid();
  key text;
  cid uuid;
  are_friends boolean;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _other IS NULL OR _other = me THEN RAISE EXCEPTION 'invalid recipient'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = _other) THEN
    RAISE EXCEPTION 'recipient not found';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'blocked'
      AND ((f.requester_id = me AND f.addressee_id = _other)
        OR (f.addressee_id = me AND f.requester_id = _other))
  ) THEN
    RAISE EXCEPTION 'conversation unavailable';
  END IF;

  key := least(me::text, _other::text) || ':' || greatest(me::text, _other::text);

  SELECT id INTO cid FROM public.conversations WHERE dm_key = key;
  IF cid IS NOT NULL THEN RETURN cid; END IF;

  are_friends := EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'accepted'
      AND ((f.requester_id = me AND f.addressee_id = _other)
        OR (f.addressee_id = me AND f.requester_id = _other))
  );

  INSERT INTO public.conversations (kind, created_by, dm_key)
  VALUES ('dm', me, key)
  ON CONFLICT (dm_key) WHERE dm_key IS NOT NULL DO NOTHING
  RETURNING id INTO cid;

  IF cid IS NULL THEN
    SELECT id INTO cid FROM public.conversations WHERE dm_key = key;
    RETURN cid;
  END IF;

  INSERT INTO public.conversation_members (conversation_id, user_id, role, accepted)
  VALUES (cid, me, 'owner', true), (cid, _other, 'member', are_friends)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN cid;
END;
$function$;