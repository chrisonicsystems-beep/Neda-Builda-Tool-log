-- Legacy Migration RPC
-- This safely allows users with an old password but no Supabase Auth account
-- to claim an Auth account and link their profile.

CREATE OR REPLACE FUNCTION public.migrate_legacy_user(p_email text, p_password text, p_auth_uid uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user public.users;
BEGIN
  -- Find the user matching the email and legacy password
  SELECT * INTO v_user
  FROM public.users
  WHERE lower(email) = lower(p_email) AND password = p_password AND is_enabled = true
  LIMIT 1;

  -- If found, and they don't already have an auth_uid linked (or we are overriding)
  IF FOUND THEN
    UPDATE public.users 
    SET auth_uid = p_auth_uid
    WHERE id = v_user.id;
    
    RETURN row_to_json(v_user);
  ELSE
    RETURN NULL;
  END IF;
END;
$$;

ALTER FUNCTION public.migrate_legacy_user(text, text, uuid) OWNER TO postgres;

-- Make sure we allow unauthenticated access to the function just for this migration step
GRANT EXECUTE ON FUNCTION public.migrate_legacy_user(text, text, uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.migrate_legacy_user(text, text, uuid) TO authenticated;
