BEGIN;

-- 1. Temporarily disable RLS entirely mapping
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Drop EVERY policy mapping on the users table (we start completely fresh, no lingering recursive policies)
DO $$ 
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- 3. Drop existing test functions
DROP FUNCTION IF EXISTS public.is_admin();
DROP FUNCTION IF EXISTS public.get_all_users_admin();

-- 4. Create the safely mapped admin checker.
-- It works strictly for Updates and Deletes, ensuring it does NOT create a SELECT infinite loop mapping.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_uid = auth.uid() AND role = 'ADMIN' AND is_enabled = true
  );
$$;

ALTER FUNCTION public.is_admin() OWNER TO postgres;

-- 5. Create the RPC that Admins will use to fetch the users list. 
-- RPCs bypass RLS policies directly, guaranteeing ZERO RECURSION during fetch.
CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS SETOF public.users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_admin() THEN
    RETURN QUERY SELECT * FROM public.users;
  ELSE
    RAISE EXCEPTION 'Access denied';
  END IF;
END;
$$;

ALTER FUNCTION public.get_all_users_admin() OWNER TO postgres;

-- 6. Setup the FRESH minimal policies.
-- CRITICAL CHANGE: ONLY ONE SELECT POLICY EXISTS. 
-- By not offering an Admin SELECT policy here, we permanently fix the infinite recursion mapping defect.
CREATE POLICY "v6 user can select own row" 
ON public.users FOR SELECT 
USING (auth_uid = auth.uid());

CREATE POLICY "v6 user can update own row" 
ON public.users FOR UPDATE 
USING (auth_uid = auth.uid())
WITH CHECK (auth_uid = auth.uid());

CREATE POLICY "v6 user can insert own row" 
ON public.users FOR INSERT 
WITH CHECK (auth_uid = auth.uid());

-- Admin Update/Delete/Insert Policies (Safe to use is_admin() here because it's not a SELECT evaluating a SELECT)
CREATE POLICY "v6 admin can update any row" 
ON public.users FOR UPDATE 
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "v6 admin can insert any row" 
ON public.users FOR INSERT 
WITH CHECK (public.is_admin());

CREATE POLICY "v6 admin can delete any row" 
ON public.users FOR DELETE 
USING (public.is_admin());

-- 7. Turn RLS back on
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 8. Hard flush the API cache
NOTIFY pgrst, 'reload schema';

COMMIT;
