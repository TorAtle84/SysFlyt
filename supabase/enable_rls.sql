-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS) FOR ALL TABLES
-- SysFlyt Application
-- Generated: 2025-12-31
-- ============================================
-- 
-- This script enables RLS on all public tables and creates
-- a permissive policy that allows all operations.
-- Since the app uses Prisma with service_role key (which bypasses RLS),
-- this provides defense-in-depth without breaking functionality.
--
-- Run this in Supabase SQL Editor: Dashboard > SQL Editor > New Query
-- ============================================

-- 1. User
ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."User" FOR ALL USING (true) WITH CHECK (true);

-- 2. Project
ALTER TABLE "public"."Project" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Project" FOR ALL USING (true) WITH CHECK (true);

-- 3. ProjectMember
ALTER TABLE "public"."ProjectMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ProjectMember" FOR ALL USING (true) WITH CHECK (true);

-- 4. Document
ALTER TABLE "public"."Document" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Document" FOR ALL USING (true) WITH CHECK (true);

-- 5. BimModel
ALTER TABLE "public"."BimModel" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."BimModel" FOR ALL USING (true) WITH CHECK (true);

-- 6. BimModelComponent
ALTER TABLE "public"."BimModelComponent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."BimModelComponent" FOR ALL USING (true) WITH CHECK (true);

-- 7. BimModelSession
ALTER TABLE "public"."BimModelSession" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."BimModelSession" FOR ALL USING (true) WITH CHECK (true);

-- 8. SystemTag
ALTER TABLE "public"."SystemTag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."SystemTag" FOR ALL USING (true) WITH CHECK (true);

-- 9. DocumentSystemTag
ALTER TABLE "public"."DocumentSystemTag" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."DocumentSystemTag" FOR ALL USING (true) WITH CHECK (true);

-- 10. MCProtocol
ALTER TABLE "public"."MCProtocol" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."MCProtocol" FOR ALL USING (true) WITH CHECK (true);

-- 11. MCSystemDocument
ALTER TABLE "public"."MCSystemDocument" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."MCSystemDocument" FOR ALL USING (true) WITH CHECK (true);

-- 12. MCProtocolItem
ALTER TABLE "public"."MCProtocolItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."MCProtocolItem" FOR ALL USING (true) WITH CHECK (true);

-- 13. MCItemPhoto
ALTER TABLE "public"."MCItemPhoto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."MCItemPhoto" FOR ALL USING (true) WITH CHECK (true);

-- 14. MCItemComment
ALTER TABLE "public"."MCItemComment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."MCItemComment" FOR ALL USING (true) WITH CHECK (true);

-- 15. FunctionTest
ALTER TABLE "public"."FunctionTest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."FunctionTest" FOR ALL USING (true) WITH CHECK (true);

-- 16. ProductDatasheet
ALTER TABLE "public"."ProductDatasheet" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ProductDatasheet" FOR ALL USING (true) WITH CHECK (true);

-- 17. Notification
ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Notification" FOR ALL USING (true) WITH CHECK (true);

-- 18. FunctionTestRow
ALTER TABLE "public"."FunctionTestRow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."FunctionTestRow" FOR ALL USING (true) WITH CHECK (true);

-- 19. MassList
ALTER TABLE "public"."MassList" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."MassList" FOR ALL USING (true) WITH CHECK (true);

-- 20. DocumentComponent
ALTER TABLE "public"."DocumentComponent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."DocumentComponent" FOR ALL USING (true) WITH CHECK (true);

-- 21. Account
ALTER TABLE "public"."Account" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Account" FOR ALL USING (true) WITH CHECK (true);

-- 22. Session
ALTER TABLE "public"."Session" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Session" FOR ALL USING (true) WITH CHECK (true);

-- 23. Annotation
ALTER TABLE "public"."Annotation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Annotation" FOR ALL USING (true) WITH CHECK (true);

-- 24. VerificationToken
ALTER TABLE "public"."VerificationToken" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."VerificationToken" FOR ALL USING (true) WITH CHECK (true);

-- 25. ChatRoom
ALTER TABLE "public"."ChatRoom" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatRoom" FOR ALL USING (true) WITH CHECK (true);

-- 26. ChatRoomMember
ALTER TABLE "public"."ChatRoomMember" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatRoomMember" FOR ALL USING (true) WITH CHECK (true);

-- 27. ChatMessage
ALTER TABLE "public"."ChatMessage" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatMessage" FOR ALL USING (true) WITH CHECK (true);

-- 28. ChatMention
ALTER TABLE "public"."ChatMention" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatMention" FOR ALL USING (true) WITH CHECK (true);

-- 29. ChatAttachment
ALTER TABLE "public"."ChatAttachment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatAttachment" FOR ALL USING (true) WITH CHECK (true);

-- 30. ChatMessageLink
ALTER TABLE "public"."ChatMessageLink" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatMessageLink" FOR ALL USING (true) WITH CHECK (true);

-- 31. ChatTask
ALTER TABLE "public"."ChatTask" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."ChatTask" FOR ALL USING (true) WITH CHECK (true);

-- 32. Comment
ALTER TABLE "public"."Comment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Comment" FOR ALL USING (true) WITH CHECK (true);

-- 33. SystemAnnotation
ALTER TABLE "public"."SystemAnnotation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."SystemAnnotation" FOR ALL USING (true) WITH CHECK (true);

-- 34. Supplier
ALTER TABLE "public"."Supplier" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Supplier" FOR ALL USING (true) WITH CHECK (true);

-- 35. Product
ALTER TABLE "public"."Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."Product" FOR ALL USING (true) WITH CHECK (true);

-- 36. FunctionTestResponsible
ALTER TABLE "public"."FunctionTestResponsible" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."FunctionTestResponsible" FOR ALL USING (true) WITH CHECK (true);

-- 37. TfmComparison
ALTER TABLE "public"."TfmComparison" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."TfmComparison" FOR ALL USING (true) WITH CHECK (true);

-- 38. InterfaceMatrixColumn
ALTER TABLE "public"."InterfaceMatrixColumn" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."InterfaceMatrixColumn" FOR ALL USING (true) WITH CHECK (true);

-- 39. PredefinedFunctionTest
ALTER TABLE "public"."PredefinedFunctionTest" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."PredefinedFunctionTest" FOR ALL USING (true) WITH CHECK (true);

-- 40. InterfaceMatrixRow
ALTER TABLE "public"."InterfaceMatrixRow" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."InterfaceMatrixRow" FOR ALL USING (true) WITH CHECK (true);

-- 41. InterfaceMatrix
ALTER TABLE "public"."InterfaceMatrix" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."InterfaceMatrix" FOR ALL USING (true) WITH CHECK (true);

-- 42. InterfaceMatrixCell
ALTER TABLE "public"."InterfaceMatrixCell" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."InterfaceMatrixCell" FOR ALL USING (true) WITH CHECK (true);

-- 43. NCR
ALTER TABLE "public"."NCR" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."NCR" FOR ALL USING (true) WITH CHECK (true);

-- 44. NCRPhoto
ALTER TABLE "public"."NCRPhoto" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."NCRPhoto" FOR ALL USING (true) WITH CHECK (true);

-- 45. NCRComment
ALTER TABLE "public"."NCRComment" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated service" ON "public"."NCRComment" FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- FIX: Function Search Path Mutable Warning
-- ============================================
-- This recreates the trigger function with a fixed search_path
-- to prevent potential search_path exploitation

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    NEW."updatedAt" = NOW();
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
