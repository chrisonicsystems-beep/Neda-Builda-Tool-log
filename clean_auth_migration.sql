BEGIN;

-- 1. Disable RLS momentarily to clean state
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. Drop EVERY SINGLE policy that could possibly exist to wipe out the recursive ones
DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;
DROP POLICY IF EXISTS "Admins can view all users" ON public.users;
DROP POLICY IF EXISTS "Admins can update all users" ON public.users;
DROP POLICY IF EXISTS "Admins can insert all users" ON public.users;
DROP POLICY IF EXISTS "Admins can delete all users" ON public.users;
DROP POLICY IF EXISTS "admin can select all users v2" ON public.users;
DROP POLICY IF EXISTS "admin can update all users v2" ON public.users;
DROP POLICY IF EXISTS "user can select own row v2" ON public.users;
DROP POLICY IF EXISTS "user can update own row v2" ON public.users;
DROP POLICY IF EXISTS "user can insert own row v2" ON public.users;
DROP POLICY IF EXISTS "v3 user select own profile" ON public.users;
DROP POLICY IF EXISTS "v3 user update own profile" ON public.users;
DROP POLICY IF EXISTS "v3 user insert own profile" ON public.users;
DROP POLICY IF EXISTS "v3 admin select all" ON public.users;
DROP POLICY IF EXISTS "v3 admin update all" ON public.users;

-- Also try dynamic drop just in case any other names exist
DO $$ 
DECLARE
  pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.users', pol.policyname);
  END LOOP;
END $$;

-- 3. Safely add a UNIQUE constraint to auth_uid if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE (conname = 'users_auth_uid_unique' OR conname = 'users_auth_uid_key')
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_auth_uid_unique UNIQUE (auth_uid);
  END IF;
END $$;

-- 4. Create a safe SECURITY DEFINER function to check admin status
DROP FUNCTION IF EXISTS public.is_admin();

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  -- BYPASSRLS is guaranteed when owned by postgres. This breaks the recursion completely.
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_uid = auth.uid() AND role = 'ADMIN' AND is_enabled = true
  );
$$;

-- Ensure the function is owned by postgres to guarantee it bypasses RLS
ALTER FUNCTION public.is_admin() OWNER TO postgres;

-- 5. Create Fresh Non-Recursive RLS Policies
CREATE POLICY "v4 can view own profile" 
ON public.users FOR SELECT 
USING (auth_uid = auth.uid() AND is_enabled = true);

CREATE POLICY "v4 can update own profile" 
ON public.users FOR UPDATE 
USING (auth_uid = auth.uid() AND is_enabled = true)
WITH CHECK (auth_uid = auth.uid() AND is_enabled = true);

CREATE POLICY "v4 can insert own profile" 
ON public.users FOR INSERT 
WITH CHECK (auth_uid = auth.uid());

CREATE POLICY "v4 admin select all" 
ON public.users FOR SELECT 
USING (public.is_admin());

CREATE POLICY "v4 admin update all" 
ON public.users FOR UPDATE 
USING (public.is_admin())
WITH CHECK (public.is_admin());

CREATE POLICY "v4 admin insert all" 
ON public.users FOR INSERT 
WITH CHECK (public.is_admin());

CREATE POLICY "v4 admin delete all" 
ON public.users FOR DELETE 
USING (public.is_admin());

-- 6. Re-enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- 7. Hard flush the API cache so the app doesn't keep running old recursive policies
NOTIFY pgrst, 'reload schema';

COMMIT;
