CREATE OR REPLACE FUNCTION public.is_blocked_with(_other uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.friendships f
    WHERE f.status = 'blocked'
      AND ((f.requester_id = auth.uid() AND f.addressee_id = _other)
        OR (f.addressee_id = auth.uid() AND f.requester_id = _other))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_blocked_with(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_blocked_with(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR NOT public.is_blocked_with(id));

CREATE OR REPLACE FUNCTION public.friendship_state(_other uuid)
RETURNS TABLE (friendship_id uuid, status text, incoming boolean, blocked_by uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT f.id, f.status::text, f.addressee_id = auth.uid(), f.blocked_by
  FROM public.friendships f
  WHERE (f.requester_id = auth.uid() AND f.addressee_id = _other)
     OR (f.addressee_id = auth.uid() AND f.requester_id = _other)
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.friendship_state(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.friendship_state(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.search_profiles(_term text, _limit int DEFAULT 20)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  bio text,
  pronouns text,
  avatar_color text,
  avatar_url text,
  banner_url text,
  presence public.presence_state,
  friendship_id uuid,
  friendship_status text,
  incoming boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.display_name, p.bio, p.pronouns, p.avatar_color,
         p.avatar_url, p.banner_url, p.presence,
         f.id, f.status::text, f.addressee_id = auth.uid()
  FROM public.profiles p
  LEFT JOIN public.friendships f
    ON (f.requester_id = auth.uid() AND f.addressee_id = p.id)
    OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
  WHERE auth.uid() IS NOT NULL
    AND p.id <> auth.uid()
    AND (
      _term IS NULL OR btrim(_term) = ''
      OR p.username ILIKE '%' || btrim(regexp_replace(_term, '^@', '')) || '%'
      OR p.display_name ILIKE '%' || btrim(_term) || '%'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.friendships b
      WHERE b.status = 'blocked'
        AND ((b.requester_id = auth.uid() AND b.addressee_id = p.id)
          OR (b.addressee_id = auth.uid() AND b.requester_id = p.id))
    )
  ORDER BY (p.username ILIKE btrim(regexp_replace(coalesce(_term,''), '^@', '')) || '%') DESC, p.username
  LIMIT LEAST(coalesce(_limit, 20), 50);
$$;

REVOKE EXECUTE ON FUNCTION public.search_profiles(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_profiles(text, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_profile(_id uuid)
RETURNS TABLE (
  id uuid,
  username text,
  display_name text,
  bio text,
  pronouns text,
  avatar_color text,
  avatar_url text,
  banner_url text,
  presence public.presence_state,
  friendship_id uuid,
  friendship_status text,
  incoming boolean,
  blocked_by uuid
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.username, p.display_name, p.bio, p.pronouns, p.avatar_color,
         p.avatar_url, p.banner_url, p.presence,
         f.id, f.status::text, f.addressee_id = auth.uid(), f.blocked_by
  FROM public.profiles p
  LEFT JOIN public.friendships f
    ON (f.requester_id = auth.uid() AND f.addressee_id = p.id)
    OR (f.addressee_id = auth.uid() AND f.requester_id = p.id)
  WHERE auth.uid() IS NOT NULL AND p.id = _id
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.public_profile(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.public_profile(uuid) TO authenticated, service_role;