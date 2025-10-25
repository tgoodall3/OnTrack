CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
DECLARE
  tenant_id text;
  owner_role_id text;
  user_id text;
  role_record record;
BEGIN
  SELECT id INTO tenant_id FROM "Tenant" WHERE slug = 'demo-contractors' LIMIT 1;

  IF tenant_id IS NULL THEN
    tenant_id := substr(encode(gen_random_bytes(16), 'hex'), 1, 24);
    INSERT INTO "Tenant"(id, name, slug, plan, "updatedAt")
    VALUES (tenant_id, 'Demo Contractors', 'demo-contractors', 'PRO', CURRENT_TIMESTAMP);
  ELSE
    UPDATE "Tenant"
      SET plan = 'PRO',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = tenant_id;
  END IF;

  FOR role_record IN
    SELECT *
    FROM (VALUES
      ('OWNER', 'Owner/Admin'),
      ('ADMIN', 'Admin'),
      ('OFFICE', 'Office Staff'),
      ('CREW', 'Crew Member'),
      ('PROPERTY_MANAGER', 'Property Manager'),
      ('CLIENT', 'Client')
    ) AS roles(role_key, role_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM "Role"
      WHERE "tenantId" = tenant_id AND key = role_record.role_key::"RoleKey"
    ) THEN
      INSERT INTO "Role"(id, "tenantId", key, name, "createdAt", "updatedAt")
      VALUES (
        substr(encode(gen_random_bytes(16), 'hex'), 1, 24),
        tenant_id,
        role_record.role_key::"RoleKey",
        role_record.role_name,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      );
    ELSE
      UPDATE "Role"
        SET name = role_record.role_name,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "tenantId" = tenant_id AND key = role_record.role_key::"RoleKey";
    END IF;
  END LOOP;

  SELECT id INTO owner_role_id
  FROM "Role"
  WHERE "tenantId" = tenant_id AND key = 'OWNER'::"RoleKey"
  LIMIT 1;

  SELECT id INTO user_id
  FROM "User"
  WHERE "tenantId" = tenant_id AND email = 'owner@demo.contractors'
  LIMIT 1;

  IF user_id IS NULL THEN
    user_id := substr(encode(gen_random_bytes(16), 'hex'), 1, 24);
    INSERT INTO "User"(id, "tenantId", email, name, "createdAt", "updatedAt")
    VALUES (user_id, tenant_id, 'owner@demo.contractors', 'Demo Owner', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
  ELSE
    UPDATE "User"
      SET name = 'Demo Owner',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = user_id;
  END IF;

  IF owner_role_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM "UserRole" WHERE "userId" = user_id AND "roleId" = owner_role_id
    ) THEN
      INSERT INTO "UserRole"(id, "userId", "roleId", "createdAt")
      VALUES (
        substr(encode(gen_random_bytes(16), 'hex'), 1, 24),
        user_id,
        owner_role_id,
        CURRENT_TIMESTAMP
      );
    END IF;
  END IF;
END $$;
