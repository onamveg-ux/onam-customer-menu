-- Run AFTER 001_secure_ordering.sql. Existing staff become counter staff.
begin;
alter table private.staff add column role text not null default 'counter' check(role in ('counter','kitchen','manager'));
create table private.staff_audit(id bigint generated always as identity primary key, actor uuid not null, action text not null, details jsonb not null, created_at timestamptz not null default now());
alter table private.staff_audit enable row level security;
create function public.staff_role() returns text language sql stable security definer set search_path='' as $$
 select role from private.staff where user_id=auth.uid() and active;
$$;
create function private.require_staff() returns text language plpgsql stable security definer set search_path='' as $$
declare r text:=public.staff_role(); begin
 if r is null or coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Staff access and authenticator verification required.' using errcode='42501'; end if;
 return r;
end; $$;
-- Staff must use the projected RPC: raw order reads now expose only one's own customer orders.
drop policy own_or_staff_orders on public.orders;
create policy own_orders on public.orders for select to authenticated using(customer_id=auth.uid());
create function private.staff_ticket(o public.orders,r text) returns jsonb language sql immutable set search_path='' as $$
 select case when r='kitchen' then jsonb_build_object('id',o.id,'created_at',o.created_at,'updated_at',o.updated_at,'status',o.status,'fulfilment',o.fulfilment,'table_number',o.table_number,'notes',o.notes,'dish_count',o.dish_count,'items',(select jsonb_agg(jsonb_build_object('id',i->>'id','name',i->>'name','quantity',i->'quantity')) from jsonb_array_elements(o.items) i)) else to_jsonb(o)-'customer_id'-'request_id' end;
$$;
create function public.staff_orders(p_history boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare r text:=private.require_staff(); result jsonb; begin
 if p_history and r<>'manager' then raise exception 'Manager access required.' using errcode='42501'; end if;
 select coalesce(jsonb_agg(private.staff_ticket(t,r) order by t.created_at),'[]') into result from
 (select o.* from public.orders o where
 (case when p_history then o.created_at>now()-interval '30 days' else o.status in ('pending_acceptance','awaiting_call','queued','preparing','ready') end)
 and (r<>'kitchen' or o.status in ('queued','preparing','ready')) order by o.created_at desc limit case when p_history then 200 else null end) t;
 return result;
end; $$;
-- Keep the existing transaction/state-machine logic private; expose only role-checked actions.
alter function public.staff_transition(uuid,text,text) set schema private;
revoke all on function private.staff_transition(uuid,text,text) from public,anon,authenticated;
create function public.staff_transition(p_order_id uuid,p_action text,p_call_note text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare r text:=private.require_staff(); o public.orders; begin
 if not (r='manager' or (r='counter' and p_action in ('accept','confirm_call','reject','complete')) or (r='kitchen' and p_action in ('prepare','ready'))) then raise exception 'This action is not permitted for your staff role.' using errcode='42501'; end if;
 select * into o from private.staff_transition(p_order_id,p_action,p_call_note);
 return private.staff_ticket(o,r);
end; $$;
create function public.manager_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if private.require_staff()<>'manager' then raise exception 'Manager access required.' using errcode='42501'; end if;
 return jsonb_build_object('enabled',(select enabled from public.ordering_settings where id=true),
 'staff',(select coalesce(jsonb_agg(to_jsonb(s)),'[]') from private.staff s),
 'menu',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.menu_items m),
 'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (select order_id,actor,action,note,created_at from private.order_audit order by created_at desc limit 100) a),
 'management_audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]') from (select actor,action,details,created_at from private.staff_audit order by created_at desc limit 100) a));
end; $$;
create function public.manager_setting(p_enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.require_staff()<>'manager' then raise exception 'Manager access required.' using errcode='42501'; end if;
 if p_enabled is null then raise exception 'Choose an ordering status.'; end if;
 update public.ordering_settings set enabled=p_enabled where id=true;
 insert into private.staff_audit(actor,action,details) values(auth.uid(),'ordering_status',jsonb_build_object('enabled',p_enabled));
end; $$;
create function public.manager_availability(p_item_id text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.require_staff()<>'manager' then raise exception 'Manager access required.' using errcode='42501'; end if;
 if p_active is null then raise exception 'Choose availability.'; end if;
 update public.menu_items set active=p_active where id=p_item_id;
 if not found then raise exception 'Dish not found.'; end if;
 insert into private.staff_audit(actor,action,details) values(auth.uid(),'dish_availability',jsonb_build_object('id',p_item_id,'active',p_active));
end; $$;
create function public.manager_staff(p_user_id uuid,p_role text,p_active boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if private.require_staff()<>'manager' then raise exception 'Manager access required.' using errcode='42501'; end if;
 if p_user_id=auth.uid() then raise exception 'You cannot change your own access.'; end if;
 if p_role is null or p_role not in ('counter','kitchen','manager') or p_active is null then raise exception 'Choose a valid role and status.'; end if;
 if not exists(select 1 from auth.users where id=p_user_id and not coalesce(is_anonymous,false) and (email_confirmed_at is not null or phone_confirmed_at is not null)) then raise exception 'The employee must sign in with a verified account first.'; end if;
 insert into private.staff(user_id,role,active) values(p_user_id,p_role,p_active) on conflict(user_id) do update set role=excluded.role,active=excluded.active;
 insert into private.staff_audit(actor,action,details) values(auth.uid(),'staff_access',jsonb_build_object('user_id',p_user_id,'role',p_role,'active',p_active));
end; $$;
revoke all on function public.staff_role(),public.staff_orders(boolean),public.staff_transition(uuid,text,text),public.manager_overview(),public.manager_setting(boolean),public.manager_availability(text,boolean),public.manager_staff(uuid,text,boolean) from public,anon;
grant execute on function public.staff_role(),public.staff_orders(boolean),public.staff_transition(uuid,text,text),public.manager_overview(),public.manager_setting(boolean),public.manager_availability(text,boolean),public.manager_staff(uuid,text,boolean) to authenticated;
revoke all on function private.require_staff(),private.staff_ticket(public.orders,text) from public,anon,authenticated;
commit;
