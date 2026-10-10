-- Run once in a NEW Supabase project's SQL editor, then run seed.sql.
-- Ordering is disabled until the owner completes setup and explicitly enables it.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.staff(user_id uuid primary key references auth.users(id), active boolean not null default true);
create table public.ordering_settings(id boolean primary key default true check(id), enabled boolean not null default false, auth_channel text not null default 'phone' check(auth_channel in ('phone','email')));
insert into public.ordering_settings(id) values(true);
create table public.menu_items(id text primary key, name text not null, category text not null, description text not null default '', price_paise integer not null check(price_paise>0), image text, active boolean not null default true);
create table public.orders(
 id uuid primary key default gen_random_uuid(), customer_id uuid not null references auth.users(id), request_id uuid not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 status text not null check(status in ('pending_acceptance','awaiting_call','queued','preparing','ready','completed','rejected','cancelled')),
 customer_name text not null, contact text not null, fulfilment text not null check(fulfilment in ('pickup','dine_in')), table_number integer check(table_number between 1 and 10),
 notes text not null default '', items jsonb not null, total_paise integer not null, dish_count integer not null check(dish_count between 1 and 100),
 call_confirmed_at timestamptz, call_confirmed_by uuid references auth.users(id),
 unique(customer_id,request_id),
 check(dish_count<=10 or status in ('awaiting_call','rejected','cancelled') or (call_confirmed_at is not null and call_confirmed_by is not null))
);
create index orders_customer_created on public.orders(customer_id,created_at desc);
create index orders_status_created on public.orders(status,created_at);
create table private.order_audit(id bigint generated always as identity primary key, order_id uuid not null references public.orders(id), actor uuid not null, action text not null, note text not null default '', created_at timestamptz not null default now());
alter table public.menu_items enable row level security;
alter table public.ordering_settings enable row level security;
alter table public.orders enable row level security;
alter table private.staff enable row level security;
alter table private.order_audit enable row level security;
revoke all on public.menu_items,public.ordering_settings,public.orders from anon,authenticated;
grant select on public.menu_items,public.ordering_settings to anon,authenticated;
grant select on public.orders to authenticated;
create policy public_menu on public.menu_items for select using(active);
create policy public_settings on public.ordering_settings for select using(true);

-- Membership is assigned by the owner in SQL, never via user-editable metadata.
create function public.staff_access() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.staff where user_id=auth.uid() and active);
$$;
create function private.is_staff() returns boolean language sql stable security definer set search_path='' as $$
 select public.staff_access() and (auth.jwt()->>'aal')='aal2';
$$;
grant usage on schema private to authenticated;
grant execute on function private.is_staff() to authenticated;
create policy own_or_staff_orders on public.orders for select to authenticated using(customer_id=auth.uid() or private.is_staff());

create function public.place_order(p_request_id uuid,p_items jsonb,p_name text,p_fulfilment text,p_table integer,p_notes text,p_expected_total integer)
returns public.orders language plpgsql security definer set search_path='' as $$
declare
 uid uuid:=auth.uid(); settings public.ordering_settings; result public.orders; line jsonb; item public.menu_items;
 qty integer; dishes integer:=0; total integer:=0; snapshot jsonb:='[]'; verified_contact text; previous_id text; seen text[]:='{}';
begin
 if uid is null then raise exception 'Sign in to place an order.' using errcode='42501'; end if;
 select * into settings from public.ordering_settings where id=true;
 if not settings.enabled then raise exception 'Online ordering is not accepting orders. Please call the restaurant.'; end if;
 -- A verified provider identity, not a browser checkbox. Reject anonymous users.
 select case when settings.auth_channel='phone' and u.phone_confirmed_at is not null then u.phone
             when settings.auth_channel='email' and u.email_confirmed_at is not null then u.email end
 into verified_contact from auth.users u where u.id=uid and not coalesce(u.is_anonymous,false);
 if verified_contact is null then raise exception 'Verify your contact details first.' using errcode='42501'; end if;
 -- Require a recent one-time-code authentication; a stale token cannot submit.
 if not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a
   where a->>'method'='otp' and (a->>'timestamp')::numeric >= extract(epoch from now())-3600)
 then raise exception 'Please sign in again with a fresh verification code.' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Missing order reference.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
 select * into result from public.orders where customer_id=uid and request_id=p_request_id;
 if found then return result; end if;
 if length(trim(coalesce(p_name,''))) not between 2 and 80 or length(coalesce(p_notes,''))>500 then raise exception 'Check your name and order notes.'; end if;
 if p_fulfilment is null or p_fulfilment not in ('pickup','dine_in') or (p_fulfilment='dine_in' and (p_table is null or p_table not between 1 and 10)) or (p_fulfilment='pickup' and p_table is not null) then raise exception 'Choose a valid pickup or table option.'; end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) not between 1 and 50 or octet_length(p_items::text)>12000 then raise exception 'Invalid order items.'; end if;
 if exists(select 1 from public.orders where customer_id=uid and status in ('pending_acceptance','awaiting_call','queued','preparing','ready')) then raise exception 'You already have an active order. Call the restaurant to add dishes.'; end if;
 if (select count(*) from public.orders where customer_id=uid and created_at>now()-interval '15 minutes')>=3
 or (select count(*) from public.orders where customer_id=uid and created_at>now()-interval '1 day')>=20 then raise exception 'Too many order requests. Please call the restaurant.'; end if;
 for line in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(line) is distinct from 'object' or (line-'id'-'quantity')<>'{}'::jsonb or coalesce(line->>'quantity','') !~ '^[1-9][0-9]?$' then raise exception 'Invalid item quantity.'; end if;
  previous_id:=line->>'id';
  if previous_id=any(seen) then raise exception 'Duplicate item. Use the quantity control.'; end if;
  seen:=array_append(seen,previous_id);
  qty:=(line->>'quantity')::integer;
  select * into item from public.menu_items where id=previous_id and active for share;
  if not found then raise exception 'A dish is no longer available. Refresh the menu.'; end if;
  dishes:=dishes+qty; if dishes>100 then raise exception 'For more than 100 portions, please call the restaurant.'; end if;
  total:=total+item.price_paise*qty;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('id',item.id,'name',item.name,'quantity',qty,'unit_price_paise',item.price_paise));
 end loop;
 if p_expected_total is null or p_expected_total<>total then raise exception 'Menu prices have changed. Refresh the menu and review the total.'; end if;
 insert into public.orders(customer_id,request_id,status,customer_name,contact,fulfilment,table_number,notes,items,total_paise,dish_count)
 values(uid,p_request_id,case when dishes>10 then 'awaiting_call' else 'pending_acceptance' end,trim(p_name),verified_contact,p_fulfilment,p_table,coalesce(p_notes,''),snapshot,total,dishes) returning * into result;
 insert into private.order_audit(order_id,actor,action) values(result.id,uid,'submitted');
 return result;
end;
$$;

create function public.staff_transition(p_order_id uuid,p_action text,p_call_note text default '') returns public.orders
language plpgsql security definer set search_path='' as $$
declare result public.orders; next_status text;
begin
 if not private.is_staff() then raise exception 'Staff access and authenticator verification required.' using errcode='42501'; end if;
 select * into result from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found.'; end if;
 if p_action='reject' and result.status in ('pending_acceptance','awaiting_call') then next_status:='rejected';
 elsif p_action='accept' and result.status='pending_acceptance' and result.dish_count<=10 then next_status:='queued';
 elsif p_action='confirm_call' and result.status='awaiting_call' and result.dish_count>10 then
  if length(trim(coalesce(p_call_note,''))) not between 10 and 500 then raise exception 'Record who you spoke to and the kitchen confirmation.'; end if;
  next_status:='queued';
 elsif p_action='prepare' and result.status='queued' then next_status:='preparing';
 elsif p_action='ready' and result.status='preparing' then next_status:='ready';
 elsif p_action='complete' and result.status='ready' then next_status:='completed';
 else raise exception 'This action is not allowed for the current order state.'; end if;
 if next_status='queued' and result.created_at<now()-interval '60 minutes' then raise exception 'This request has expired. Reject it and ask the customer to place a new order.'; end if;
 update public.orders set status=next_status,updated_at=now(),call_confirmed_at=case when p_action='confirm_call' then now() else call_confirmed_at end,call_confirmed_by=case when p_action='confirm_call' then auth.uid() else call_confirmed_by end where id=p_order_id returning * into result;
 insert into private.order_audit(order_id,actor,action,note) values(result.id,auth.uid(),p_action,case when p_action='confirm_call' then trim(p_call_note) else '' end);
 return result;
end;
$$;
create function public.cancel_order(p_order_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 update public.orders set status='cancelled',updated_at=now() where id=p_order_id and customer_id=auth.uid() and status in ('pending_acceptance','awaiting_call');
 if not found then raise exception 'Only your unaccepted orders can be cancelled.'; end if;
 insert into private.order_audit(order_id,actor,action) values(p_order_id,auth.uid(),'cancelled');
end;
$$;
revoke all on function public.staff_access(),public.place_order(uuid,jsonb,text,text,integer,text,integer),public.staff_transition(uuid,text,text),public.cancel_order(uuid),private.is_staff() from public,anon;
grant execute on function public.staff_access(),public.place_order(uuid,jsonb,text,text,integer,text,integer),public.staff_transition(uuid,text,text),public.cancel_order(uuid),private.is_staff() to authenticated;
commit;
