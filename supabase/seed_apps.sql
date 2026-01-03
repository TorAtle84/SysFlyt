-- Insert the default applications into the Application table
INSERT INTO "Application" ("id", "code", "name", "description", "isActive", "updatedAt")
VALUES 
  (gen_random_uuid(), 'SYSLINK', 'SysLink', 'Kvalitetssikring og dokumenthåndtering', true, NOW()),
  (gen_random_uuid(), 'FLYTLINK', 'FlytLink', 'Kravsporing og planlegging', true, NOW())
ON CONFLICT ("code") DO NOTHING;

-- Verification query
SELECT * FROM "Application";
