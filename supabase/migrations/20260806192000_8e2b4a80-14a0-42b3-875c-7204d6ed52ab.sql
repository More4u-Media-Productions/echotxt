-- ---------- participants ----------
CREATE TABLE IF NOT EXISTS public.call_participants (
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'invited' CHECK (state IN ('invited','joined','declined','left')),
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  left_at timestamptz,
  PRIMARY KEY (call_id, user_id)
);
GRANT SELECT, UPDATE ON public.call_participants TO authenticated;
GRANT ALL ON public.call_participants TO service_role;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read call participants" ON public.call_participants
FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.calls c
  WHERE c.id = call_id AND public.is_member(c.conversation_id, auth.uid())
));

CREATE POLICY "update own participation" ON public.call_participants
FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS call_participants_user_idx ON public.call_participants(user_id, state);

-- ---------- signalling ----------
CREATE TABLE IF NOT EXISTS public.call_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
  from_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  to_user uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('offer','answer','ice','bye')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read signals addressed to me" ON public.call_signals
FOR SELECT TO authenticated USING (to_user = auth.uid());

CREATE POLICY "send signals as myself in my call" ON public.call_signals
FOR INSERT TO authenticated
WITH CHECK (
  from_user = auth.uid()
  AND EXISTS (SELECT 1 FROM public.call_participants p WHERE p.call_id = call_id AND p.user_id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.call_participants p WHERE p.call_id = call_id AND p.user_id = to_user)
);

CREATE POLICY "delete my consumed signals" ON public.call_signals
FOR DELETE TO authenticated USING (to_user = auth.uid());

CREATE INDEX IF NOT EXISTS call_signals_to_idx ON public.call_signals(to_user, created_at);

-- ---------- rpcs ----------
CREATE OR REPLACE FUNCTION public.start_call(_cid uuid, _media call_media)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  me uuid := auth.uid();
  convo public.conversations;
  cid uuid;
  existing uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT * INTO convo FROM public.conversations WHERE id = _cid;
  IF convo IS NULL THEN RAISE EXCEPTION 'conversation not found'; END IF;
  IF NOT public.is_member(_cid, me) THEN RAISE EXCEPTION 'not a member'; END IF;
  IF convo.kind = 'group' AND convo.only_admins_post AND NOT public.is_conversation_admin(_cid, me) THEN
    RAISE EXCEPTION 'only admins can start calls in this group';
  END IF;
  IF convo.kind = 'dm' THEN
    IF EXISTS (
      SELECT 1 FROM public.friendships f
      JOIN public.conversation_members m ON m.conversation_id = _cid AND m.user_id <> me
      WHERE f.status = 'blocked'
        AND ((f.requester_id = me AND f.addressee_id = m.user_id)
          OR (f.addressee_id = me AND f.requester_id = m.user_id))
    ) THEN RAISE EXCEPTION 'call unavailable'; END IF;
  END IF;

  -- reuse a call that is still ringing/active in this conversation
  SELECT c.id INTO existing FROM public.calls c
  WHERE c.conversation_id = _cid AND c.ended_at IS NULL
    AND c.started_at > now() - interval '2 hours'
  ORDER BY c.started_at DESC LIMIT 1;

  IF existing IS NOT NULL THEN
    INSERT INTO public.call_participants (call_id, user_id, state, joined_at)
    VALUES (existing, me, 'joined', now())
    ON CONFLICT (call_id, user_id) DO UPDATE SET state = 'joined', joined_at = now(), left_at = NULL;
    RETURN existing;
  END IF;

  INSERT INTO public.calls (conversation_id, caller_id, media, status, duration_seconds)
  VALUES (_cid, me, _media, 'ringing', 0)
  RETURNING id INTO cid;

  INSERT INTO public.call_participants (call_id, user_id, state, joined_at)
  VALUES (cid, me, 'joined', now());

  INSERT INTO public.call_participants (call_id, user_id, state)
  SELECT cid, m.user_id FROM public.conversation_members m
  WHERE m.conversation_id = _cid AND m.user_id <> me
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE f.status = 'blocked'
        AND ((f.requester_id = me AND f.addressee_id = m.user_id)
          OR (f.addressee_id = me AND f.requester_id = m.user_id))
    )
  ON CONFLICT DO NOTHING;

  RETURN cid;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_call(_call uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); convo uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT conversation_id INTO convo FROM public.calls WHERE id = _call AND ended_at IS NULL;
  IF convo IS NULL THEN RAISE EXCEPTION 'call is no longer active'; END IF;
  IF NOT public.is_member(convo, me) THEN RAISE EXCEPTION 'not a member'; END IF;

  INSERT INTO public.call_participants (call_id, user_id, state, joined_at)
  VALUES (_call, me, 'joined', now())
  ON CONFLICT (call_id, user_id) DO UPDATE SET state = 'joined', joined_at = now(), left_at = NULL;

  UPDATE public.calls SET status = 'answered' WHERE id = _call AND status = 'ringing';
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_call(_call uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); remaining int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.call_participants SET state = 'declined', left_at = now()
  WHERE call_id = _call AND user_id = me;

  SELECT count(*) INTO remaining FROM public.call_participants
  WHERE call_id = _call AND state IN ('invited','joined') AND user_id <> (SELECT caller_id FROM public.calls WHERE id = _call);

  IF remaining = 0 THEN
    UPDATE public.calls SET status = 'declined', ended_at = now(),
      duration_seconds = greatest(0, extract(epoch FROM (now() - started_at))::int)
    WHERE id = _call AND ended_at IS NULL AND status = 'ringing';
    UPDATE public.calls SET ended_at = now() WHERE id = _call AND ended_at IS NULL;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.leave_call(_call uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); still int; ever_joined int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.call_participants SET state = 'left', left_at = now()
  WHERE call_id = _call AND user_id = me AND state <> 'declined';

  SELECT count(*) INTO still FROM public.call_participants
  WHERE call_id = _call AND state IN ('joined','invited');

  IF still <= 1 THEN
    SELECT count(*) INTO ever_joined FROM public.call_participants
    WHERE call_id = _call AND joined_at IS NOT NULL;

    UPDATE public.calls SET
      ended_at = now(),
      duration_seconds = greatest(0, extract(epoch FROM (now() - started_at))::int),
      status = CASE WHEN ever_joined > 1 THEN 'answered'::call_status
                    WHEN status = 'declined' THEN 'declined'::call_status
                    ELSE 'missed'::call_status END
    WHERE id = _call AND ended_at IS NULL;

    UPDATE public.call_participants SET state = 'left', left_at = coalesce(left_at, now())
    WHERE call_id = _call AND state IN ('joined','invited');
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.end_call(_call uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE me uuid := auth.uid(); ever_joined int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.call_participants p WHERE p.call_id = _call AND p.user_id = me) THEN
    RAISE EXCEPTION 'not in this call';
  END IF;
  SELECT count(*) INTO ever_joined FROM public.call_participants
  WHERE call_id = _call AND joined_at IS NOT NULL;

  UPDATE public.calls SET
    ended_at = now(),
    duration_seconds = greatest(0, extract(epoch FROM (now() - started_at))::int),
    status = CASE WHEN ever_joined > 1 THEN 'answered'::call_status ELSE 'missed'::call_status END
  WHERE id = _call AND ended_at IS NULL;

  UPDATE public.call_participants SET state = 'left', left_at = coalesce(left_at, now())
  WHERE call_id = _call AND state IN ('joined','invited');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.start_call(uuid, call_media) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.join_call(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decline_call(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.leave_call(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.end_call(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.start_call(uuid, call_media) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.join_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decline_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.leave_call(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.end_call(uuid) TO authenticated, service_role;

-- ---------- realtime ----------
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;
ALTER TABLE public.call_signals REPLICA IDENTITY FULL;
ALTER TABLE public.calls REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;