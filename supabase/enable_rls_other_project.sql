-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS) FOR ALL TABLES
-- Other Project (Avatar/Clothing/Outfit App)
-- Generated: 2025-12-31
-- ============================================
-- 
-- This script enables RLS on all public tables and creates
-- a permissive policy that allows all operations.
--
-- Run this in Supabase SQL Editor: Dashboard > SQL Editor > New Query
-- ============================================

-- 1. User
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."User" FOR ALL USING (true) WITH CHECK (true);

-- 2. Avatar
ALTER TABLE "public"."Avatar" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Avatar" FOR ALL USING (true) WITH CHECK (true);

-- 3. Clothing
ALTER TABLE "public"."Clothing" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Clothing" FOR ALL USING (true) WITH CHECK (true);

-- 4. Outfit
ALTER TABLE "public"."Outfit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Outfit" FOR ALL USING (true) WITH CHECK (true);

-- 5. OutfitItem
ALTER TABLE "public"."OutfitItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."OutfitItem" FOR ALL USING (true) WITH CHECK (true);

-- 6. Trip
ALTER TABLE "public"."Trip" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Trip" FOR ALL USING (true) WITH CHECK (true);

-- 7. Post
ALTER TABLE "public"."Post" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Post" FOR ALL USING (true) WITH CHECK (true);

-- 8. Rating
ALTER TABLE "public"."Rating" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Rating" FOR ALL USING (true) WITH CHECK (true);

-- 9. Comment
ALTER TABLE "public"."Comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Comment" FOR ALL USING (true) WITH CHECK (true);

-- 10. Subscription
ALTER TABLE "public"."Subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Subscription" FOR ALL USING (true) WITH CHECK (true);

-- 11. Follow
ALTER TABLE "public"."Follow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Follow" FOR ALL USING (true) WITH CHECK (true);

-- 12. PromoAccess
ALTER TABLE "public"."PromoAccess" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."PromoAccess" FOR ALL USING (true) WITH CHECK (true);

-- 13. UserPreferences
ALTER TABLE "public"."UserPreferences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."UserPreferences" FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- FIX: Function Search Path Mutable Warnings
-- ============================================
-- IMPORTANT: Run the query below FIRST to see the current function definitions,
-- then modify the CREATE OR REPLACE statements below to match your logic.
--
-- To see current function code:
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'set_updated_at';
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'enforce_rating_rules';
-- SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'enforce_block_requires_report';

-- Fix 1: set_updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Fix 2: enforce_rating_rules
CREATE OR REPLACE FUNCTION public.enforce_rating_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_visibility public.challenge_visibility;
BEGIN
  SELECT c.visibility INTO v_visibility
  FROM public.submissions s
  JOIN public.challenges c ON c.id = s.challenge_id
  WHERE s.id = NEW.submission_id;

  IF v_visibility = 'public' AND (NEW.stars < 1 OR NEW.stars > 5) THEN
    RAISE EXCEPTION 'Public rating must be 1-5';
  END IF;

  IF v_visibility = 'private' AND (NEW.stars < 0 OR NEW.stars > 5) THEN
    RAISE EXCEPTION 'Private rating must be 0-5';
  END IF;

  RETURN NEW;
END;
$$;

-- Fix 3: enforce_block_requires_report
CREATE OR REPLACE FUNCTION public.enforce_block_requires_report()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.reports r
    WHERE r.reporter_id = NEW.blocker_id
      AND r.reported_user_id = NEW.blocked_id
      AND r.submission_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Block requires a prior picture report';
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================
-- VERIFICATION QUERY
-- Run this after to confirm RLS is enabled
-- ============================================
-- SELECT schemaname, tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- ORDER BY tablename;
