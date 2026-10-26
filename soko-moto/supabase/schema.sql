-- Soko Moto core schema for Supabase/Postgres.
-- Safe to run more than once (idempotent): tables use "if not exists", policies and triggers are dropped then recreated.
-- Run in Supabase Dashboard -> SQL Editor -> New query -> paste -> Run. Never expose service-role keys in NEXT_PUBLIC_* variables.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text not null default '',
  role text not null default 'farmer' check (role in ('farmer','buyer','community','vet','admin')),
  county text,
  phone text,
  farm_name text,
  bio text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,role,county)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',''),case when new.raw_user_meta_data->>'role' in ('farmer','buyer','community','vet') then new.raw_user_meta_data->>'role' else 'farmer' end,nullif(new.raw_user_meta_data->>'county',''))
  on conflict(id) do update set email=excluded.email;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  category text not null,
  price numeric(12,2) not null check (price > 0),
  unit text not null,
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  description text,
  county text,
  location_text text,
  latitude double precision check(latitude is null or latitude between -90 and 90),
  longitude double precision check(longitude is null or longitude between -180 and 180),
  image_urls text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists products_discover_idx on public.products(status,category,created_at desc);
create index if not exists products_seller_idx on public.products(seller_id,created_at desc);

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in ('offer','request')),
  title text not null check(length(title) between 1 and 120),
  category text not null,
  quantity numeric(12,2) not null check(quantity > 0),
  unit text not null,
  county text not null,
  location_text text,
  description text,
  image_urls text[] not null default '{}',
  needed_by date,
  status text not null default 'open' check(status in ('open','matched','fulfilled','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists donations_board_idx on public.donations(status,kind,created_at desc);
create table if not exists public.donation_requests (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  message text,
  status text not null default 'pending' check(status in ('pending','accepted','declined','fulfilled')),
  created_at timestamptz not null default now(),
  unique(donation_id,requester_id)
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  buyer_id uuid not null references public.profiles(id) on delete restrict,
  seller_id uuid not null references public.profiles(id) on delete restrict,
  quantity numeric(12,2) not null check(quantity > 0),
  unit_price numeric(12,2) not null check(unit_price > 0),
  total_price numeric(12,2) generated always as (quantity * unit_price) stored,
  status text not null default 'requested' check(status in ('requested','accepted','preparing','ready_for_pickup','completed','cancelled')),
  buyer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(buyer_id <> seller_id)
);
create index if not exists orders_buyer_idx on public.orders(buyer_id,created_at desc);
create index if not exists orders_seller_idx on public.orders(seller_id,created_at desc);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check(length(body) between 1 and 2000),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check(sender_id <> recipient_id)
);
create index if not exists messages_sender_idx on public.messages(sender_id,created_at);
create index if not exists messages_recipient_idx on public.messages(recipient_id,created_at);

create table if not exists public.vet_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  display_name text,
  qualification text,
  specialties text[] not null default '{}',
  animal_types text[] not null default '{}',
  county text,
  service_area text,
  phone text,
  verification_status text not null default 'pending' check(verification_status in ('pending','verified','rejected')),
  verified boolean not null default false,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.vet_bookings (
  id uuid primary key default gen_random_uuid(),
  vet_profile_id uuid not null references public.vet_profiles(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete cascade,
  animal_type text not null,
  preferred_date date not null,
  description text not null,
  status text not null default 'requested' check(status in ('requested','confirmed','declined','completed','cancelled')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.donations enable row level security;
alter table public.donation_requests enable row level security;
alter table public.orders enable row level security;
alter table public.messages enable row level security;
alter table public.vet_profiles enable row level security;
alter table public.vet_bookings enable row level security;

drop policy if exists "members can read their own private profile" on public.profiles;
drop policy if exists "members can read their own private profile" on public.profiles;
create policy "members can read their own private profile" on public.profiles for select to authenticated using (auth.uid()=id);
create or replace view public.member_directory as select id,full_name,county,farm_name,avatar_url,role from public.profiles;
grant select on public.member_directory to anon,authenticated;
drop policy if exists "members update their own profile" on public.profiles;
drop policy if exists "members update their own profile" on public.profiles;
create policy "members update their own profile" on public.profiles for update to authenticated using (auth.uid()=id) with check (auth.uid()=id and role in ('farmer','buyer','community','vet'));

drop policy if exists "published products are public, sellers see own drafts" on public.products;
create policy "published products are public, sellers see own drafts" on public.products for select to anon,authenticated using (status='published' or auth.uid()=seller_id);
drop policy if exists "members create their own products" on public.products;
create policy "members create their own products" on public.products for insert to authenticated with check (auth.uid()=seller_id);
drop policy if exists "sellers update their own products" on public.products;
create policy "sellers update their own products" on public.products for update to authenticated using (auth.uid()=seller_id) with check (auth.uid()=seller_id);
drop policy if exists "sellers delete their own products" on public.products;
create policy "sellers delete their own products" on public.products for delete to authenticated using (auth.uid()=seller_id);

drop policy if exists "open donations are public" on public.donations;
create policy "open donations are public" on public.donations for select to anon,authenticated using (status='open' or auth.uid()=owner_id);
drop policy if exists "members create donations" on public.donations;
create policy "members create donations" on public.donations for insert to authenticated with check (auth.uid()=owner_id);
drop policy if exists "owners update donations" on public.donations;
create policy "owners update donations" on public.donations for update to authenticated using (auth.uid()=owner_id) with check (auth.uid()=owner_id);
drop policy if exists "owners delete donations" on public.donations;
create policy "owners delete donations" on public.donations for delete to authenticated using (auth.uid()=owner_id);
drop policy if exists "requesters and donors see donation requests" on public.donation_requests;
create policy "requesters and donors see donation requests" on public.donation_requests for select to authenticated using (auth.uid()=requester_id or exists(select 1 from public.donations d where d.id=donation_id and d.owner_id=auth.uid()));
drop policy if exists "members request donations for themselves" on public.donation_requests;
create policy "members request donations for themselves" on public.donation_requests for insert to authenticated with check (auth.uid()=requester_id);
drop policy if exists "donors manage donation requests" on public.donation_requests;
create policy "donors manage donation requests" on public.donation_requests for update to authenticated using (exists(select 1 from public.donations d where d.id=donation_id and d.owner_id=auth.uid())) with check (exists(select 1 from public.donations d where d.id=donation_id and d.owner_id=auth.uid()));

drop policy if exists "order participants can read orders" on public.orders;
create policy "order participants can read orders" on public.orders for select to authenticated using (auth.uid()=buyer_id or auth.uid()=seller_id);
drop policy if exists "buyers create their own order requests" on public.orders;
create policy "buyers create their own order requests" on public.orders for insert to authenticated with check (auth.uid()=buyer_id and buyer_id<>seller_id and exists(select 1 from public.products p where p.id=product_id and p.seller_id=seller_id and p.status='published' and p.quantity>=quantity));
drop policy if exists "participants update order status" on public.orders;
create policy "participants update order status" on public.orders for update to authenticated using (auth.uid()=buyer_id or auth.uid()=seller_id) with check (auth.uid()=buyer_id or auth.uid()=seller_id);

drop policy if exists "message participants can read messages" on public.messages;
create policy "message participants can read messages" on public.messages for select to authenticated using (auth.uid()=sender_id or auth.uid()=recipient_id);
drop policy if exists "members send messages as themselves" on public.messages;
create policy "members send messages as themselves" on public.messages for insert to authenticated with check (auth.uid()=sender_id and sender_id<>recipient_id);
drop policy if exists "recipients mark messages read" on public.messages;
create policy "recipients mark messages read" on public.messages for update to authenticated using (auth.uid()=recipient_id) with check (auth.uid()=recipient_id);

drop policy if exists "published vet profiles are public" on public.vet_profiles;
create policy "published vet profiles are public" on public.vet_profiles for select to anon,authenticated using (published=true or auth.uid()=user_id);
drop policy if exists "vets create their own profile" on public.vet_profiles;
create policy "vets create their own profile" on public.vet_profiles for insert to authenticated with check (auth.uid()=user_id);
drop policy if exists "vets update their own profile" on public.vet_profiles;
create policy "vets update their own profile" on public.vet_profiles for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
drop policy if exists "booking participants read bookings" on public.vet_bookings;
create policy "booking participants read bookings" on public.vet_bookings for select to authenticated using (auth.uid()=requester_id or exists(select 1 from public.vet_profiles v where v.id=vet_profile_id and v.user_id=auth.uid()));
drop policy if exists "members request vet appointments" on public.vet_bookings;
create policy "members request vet appointments" on public.vet_bookings for insert to authenticated with check (auth.uid()=requester_id);
drop policy if exists "providers update bookings" on public.vet_bookings;
create policy "providers update bookings" on public.vet_bookings for update to authenticated using (exists(select 1 from public.vet_profiles v where v.id=vet_profile_id and v.user_id=auth.uid())) with check (exists(select 1 from public.vet_profiles v where v.id=vet_profile_id and v.user_id=auth.uid()));

-- Storage: create a public bucket named product-images in Supabase Storage.
-- Then run these policies (object paths must begin with the authenticated user's UUID):
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('product-images','product-images',true,6291456,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set public=true,file_size_limit=6291456,allowed_mime_types=array['image/png','image/jpeg','image/webp'];
drop policy if exists "members upload product images to own folder" on storage.objects;
create policy "members upload product images to own folder" on storage.objects for insert to authenticated with check(bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "product images are publicly readable" on storage.objects;
create policy "product images are publicly readable" on storage.objects for select to anon,authenticated using(bucket_id='product-images');
drop policy if exists "members delete their own product images" on storage.objects;
create policy "members delete their own product images" on storage.objects for delete to authenticated using(bucket_id='product-images' and (storage.foldername(name))[1]=auth.uid()::text);

-- Protect moderation and order integrity from client-side self-approval or price edits.
create or replace function public.protect_vet_verification() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if tg_op='INSERT' then
      new.verified := false;
      new.verification_status := 'pending';
    elsif new.verified is distinct from old.verified or new.verification_status is distinct from old.verification_status then
      raise exception 'Veterinary verification can only be changed by platform administration.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists protect_vet_verification_fields on public.vet_profiles;
create trigger protect_vet_verification_fields before insert or update on public.vet_profiles for each row execute function public.protect_vet_verification();

create or replace function public.protect_order_integrity() returns trigger language plpgsql as $$
begin
  if auth.uid() is not null then
    if new.product_id is distinct from old.product_id or new.buyer_id is distinct from old.buyer_id or new.seller_id is distinct from old.seller_id or new.quantity is distinct from old.quantity or new.unit_price is distinct from old.unit_price or new.buyer_note is distinct from old.buyer_note then
      raise exception 'Order details cannot be edited after an order request is created.';
    end if;
    if auth.uid()=old.buyer_id and new.status is distinct from old.status and new.status not in ('cancelled') then
      raise exception 'Buyers may only cancel an order request.';
    end if;
    if auth.uid()=old.seller_id and new.status is distinct from old.status and new.status not in ('accepted','preparing','ready_for_pickup','completed','cancelled') then
      raise exception 'Invalid seller order status transition.';
    end if;
  end if;
  return new;
end; $$;
drop trigger if exists protect_order_integrity_fields on public.orders;
create trigger protect_order_integrity_fields before update on public.orders for each row execute function public.protect_order_integrity();

-- Keep updated_at fresh automatically.
create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;
do $$
declare t text;
begin
  foreach t in array array['profiles','products','donations','orders','vet_profiles'] loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
  end loop;
end $$;

-- Backfill profiles for any auth users created before the trigger existed.
insert into public.profiles(id,email,full_name)
select u.id,u.email,coalesce(u.raw_user_meta_data->>'full_name','') from auth.users u
on conflict(id) do nothing;

-- Make sure the API roles can reach the tables (RLS policies above still decide row access).
grant usage on schema public to anon, authenticated;
grant select on public.products, public.donations, public.vet_profiles to anon;
grant select, insert, update, delete on public.profiles, public.products, public.donations, public.donation_requests, public.orders, public.messages, public.vet_profiles, public.vet_bookings to authenticated;
grant select on public.member_directory to anon, authenticated;
