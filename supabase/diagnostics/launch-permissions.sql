-- Operator-only, read-only inventory. Does not access any user or secret rows.
begin transaction read only;

select c.relname as relation, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
  has_table_privilege('anon', c.oid, 'SELECT') as anon_read,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_read,
  has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
  has_table_privilege('authenticated', c.oid, 'UPDATE') as authenticated_update,
  has_table_privilege('authenticated', c.oid, 'DELETE') as authenticated_delete
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p')
  and c.relname ~ '^(user_states|classroom(s|_.+)|friend_.+|drive_connections|mobile_push_.+)$'
order by c.relname;

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where (schemaname = 'public' and tablename ~ '^(user_states|classroom(s|_.+)|friend_.+|drive_connections|mobile_push_.+)$')
   or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

select p.oid::regprocedure::text as routine, p.prosecdef as security_definer,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as server_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname ~ '^(classroom_.+|friends_action|sync_user_state.+|get_android_widget_state|recipher_drive_connection|.+mobile_push.+|tick_mobile_push)$'
order by 1;

select jobname, schedule, active
from cron.job where jobname = 'estudiemos-mobile-alarms';

select obj_description(to_regprocedure('public.tick_mobile_push()'), 'pg_proc') as push_revision;

commit;
