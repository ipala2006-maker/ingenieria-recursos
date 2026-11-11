const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');

test('registry migration revokes unused grants without breaking the Auth trigger', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create role supabase_auth_admin;
      create schema auth;
      create table auth.users (
        id uuid primary key, email text, phone text, created_at timestamptz not null default now(),
        email_confirmed_at timestamptz, phone_confirmed_at timestamptz, last_sign_in_at timestamptz
      );
      grant usage on schema auth to supabase_auth_admin;
      grant select, insert, update on auth.users to supabase_auth_admin;
    `);
    await db.exec(fs.readFileSync(require.resolve('../supabase/user-registry.sql'), 'utf8'));
    const grants = () => db.query(`
      select role, has_function_privilege(role, 'private.sync_user_registry()', 'EXECUTE') as execute
      from unnest(array['anon','authenticated','service_role']) as t(role)
    `);
    assert.ok((await grants()).rows.every(row => !row.execute));
    await db.exec('grant execute on function private.sync_user_registry() to public;');
    assert.ok((await grants()).rows.every(row => row.execute));
    await db.exec(fs.readFileSync(require.resolve('../supabase/user-registry-trigger-grants.sql'), 'utf8'));
    assert.ok((await grants()).rows.every(row => !row.execute));
    await db.exec(`
      set role supabase_auth_admin;
      insert into auth.users(id,email) values ('00000000-0000-0000-0000-000000000001','fixture@example.test');
      update auth.users set email_confirmed_at=now();
      reset role;
    `);
    assert.deepEqual((await db.query('select email, confirmed_at is not null as confirmed from public.user_registry')).rows,
      [{email:'fixture@example.test', confirmed:true}]);
  } finally {
    await db.close();
  }
});
