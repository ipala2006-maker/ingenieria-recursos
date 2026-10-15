-- Give unnamed friend profiles a stable, editable English handle without personal data.
begin;
create or replace function public.assign_friend_username()
returns trigger language plpgsql security definer set search_path='' as $$
declare
  adjectives text[]:=array['calm','bright','clear','clever','cosmic','crisp','eager','fresh','gentle','golden','happy','keen','lively','lucky','lunar','mellow','merry','neon','nimble','noble','quiet','rapid','shiny','silver','smart','solar','sparkly','steady','stellar','sunny','swift','vivid'];
  nouns text[]:=array['arc','atlas','beacon','bridge','cloud','comet','crystal','dawn','dream','echo','flare','galaxy','garden','glow','harbor','horizon','island','lantern','maple','meadow','meteor','mosaic','nova','orbit','pixel','prism','pulse','river','signal','summit','trail','wave'];
  candidate text; existing_name text; suffix integer;
begin
  -- friends_action also inserts existing IDs with ON CONFLICT DO NOTHING.
  if tg_op='INSERT' and coalesce(new.username,'')='' then
    select p.username,p.name into candidate,existing_name from public.friend_profiles p where p.user_id=new.user_id;
    if candidate is not null then
      new.username:=candidate; new.name:=existing_name; return new;
    end if;
  end if;
  if coalesce(new.username,'')<>'' then
    if tg_op='UPDATE' and new.username=old.username then return new; end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('estudiemos.friend-username:'||new.username,0));
    return new;
  end if;
  for attempt in 1..64 loop
    suffix:=case when attempt<=32 then 10+floor(pg_catalog.random()*90)::integer else 100+floor(pg_catalog.random()*900)::integer end;
    candidate:=adjectives[1+floor(pg_catalog.random()*array_length(adjectives,1))::integer]
      ||nouns[1+floor(pg_catalog.random()*array_length(nouns,1))::integer]||suffix::text;
    -- Serialize reservations of the same handle, including manually chosen ones.
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('estudiemos.friend-username:'||candidate,0));
    if not exists(select 1 from public.friend_profiles p where p.username=candidate and p.user_id<>new.user_id) then
      new.username:=candidate; new.name:=candidate; return new;
    end if;
  end loop;
  raise exception 'USERNAME_GENERATION_FAILED';
end $$;
revoke all on function public.assign_friend_username() from public,anon,authenticated,service_role;
create or replace trigger friend_auto_username
  before insert or update of username on public.friend_profiles
  for each row execute function public.assign_friend_username();
update public.friend_profiles set username=null where username is null or username='';
notify pgrst, 'reload schema';
commit;
