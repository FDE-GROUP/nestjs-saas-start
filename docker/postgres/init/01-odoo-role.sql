-- Odoo 20 CE 联调复用共享 PostgreSQL：建非超户 odoo 角色。
-- 背景：Odoo 20 硬拒用 postgres 超户连库（"Using the database user 'postgres' is a security risk, aborting"），
--       故本 SaaS 应用（postgres 超户）与 Odoo（下方 odoo 角色）共用一个 PG 实例、按库名逻辑隔离。
-- 触发：仅当 postgres-data-dev 数据卷为空（首次 initdb）时，由 postgres entrypoint 依序执行本目录 *.sql。
-- 幂等：IF NOT EXISTS 兜底，便于手工重放。
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'odoo') THEN
    CREATE ROLE odoo LOGIN PASSWORD 'odoo' CREATEDB;
  ELSE
    ALTER ROLE odoo LOGIN PASSWORD 'odoo' CREATEDB;
  END IF;
END
$$;
