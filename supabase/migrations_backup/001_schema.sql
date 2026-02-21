-- Extensions
create extension if not exists btree_gist;
create extension if not exists pgcrypto;
create extension if not exists moddatetime; 

-- 1. TENANTS
create table tenants (
    id uuid primary key default gen_random_uuid(),
    host_domain text unique not null,
    name text not null,
    config jsonb not null default '{}'::jsonb, 
    created_at timestamptz default now(),
    updated_at timestamptz default now()
);

-- 2. TABLES (Physical Inventory)
create table tables (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references tenants(id) on delete cascade not null,
    label text not null, 
    seats int not null
);
create index idx_tables_tenant on tables(tenant_id);

-- 3. TABLE JOINS (Booking Options)
create table table_joins (
    join_id text, 
    tenant_id uuid references tenants(id) on delete cascade not null,
    table_a uuid references tables(id) on delete cascade not null,
    table_b uuid references tables(id) on delete cascade, 
    seats int not null,
    primary key (tenant_id, join_id)
);
create index idx_joins_tenant on table_joins(tenant_id);

-- 4. RESERVATIONS (Metadata)
create table reservations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references tenants(id) on delete cascade not null,
    assigned_option_id text not null, 
    
    user_id uuid,
    customer_name text not null,
    phone text not null,
    party_size int not null,
    
    start_at timestamptz not null,
    end_at timestamptz not null,
    
    created_at timestamptz default now(),
    
    foreign key (tenant_id, assigned_option_id) references table_joins(tenant_id, join_id)
);
create index idx_reservations_tenant_lookup on reservations(tenant_id, start_at, end_at);

-- 5. RESERVATION TABLE BLOCKS (Physical Locks)
-- This strictly prevents overlap on physical tables, regardless of how they are joined.
create table reservation_table_blocks (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references tenants(id) on delete cascade not null,
    table_id uuid references tables(id) on delete cascade not null,
    reservation_id uuid references reservations(id) on delete cascade not null,
    
    start_at timestamptz not null,
    end_at timestamptz not null,

    -- THE IRONCLAD CONSTRAINT
    exclude using gist (
        tenant_id with =,
        table_id with =,
        tstzrange(start_at, end_at, '[)') with &&
    )
);
create index idx_blocks_lookup on reservation_table_blocks(tenant_id, table_id, start_at, end_at);

-- 6. PENDING RESERVATIONS (Transient)
create table pending_reservations (
    id uuid primary key default gen_random_uuid(),
    tenant_id uuid references tenants(id) on delete cascade not null,
    user_id uuid not null, 
    
    party_size int,
    start_at timestamptz,
    end_at timestamptz,
    
    assigned_option_id text, 
    
    customer_name text,
    phone text,
    
    updated_at timestamptz default now(),
    created_at timestamptz default now(),

    foreign key (tenant_id, assigned_option_id) references table_joins(tenant_id, join_id),
    
    -- Ensure one active pending session per user per tenant
    unique (tenant_id, user_id)
);
create index idx_pending_cleanup on pending_reservations(tenant_id, updated_at);


-- AUTO-UPDATE Triggers
create trigger handle_updated_at before update on tenants
  for each row execute procedure moddatetime (updated_at);

create trigger handle_updated_at before update on pending_reservations
  for each row execute procedure moddatetime (updated_at);


-- RLS: Strict Deny-by-Default (Insert/Select/Update/Delete blocked for Anon)
alter table tenants enable row level security;
alter table tables enable row level security;
alter table table_joins enable row level security;
alter table reservations enable row level security;
alter table reservation_table_blocks enable row level security;
alter table pending_reservations enable row level security;

create policy "No Access" on tenants for all using (false) with check (false);
create policy "No Access" on tables for all using (false) with check (false);
create policy "No Access" on table_joins for all using (false) with check (false);
create policy "No Access" on reservations for all using (false) with check (false);
create policy "No Access" on reservation_table_blocks for all using (false) with check (false);
create policy "No Access" on pending_reservations for all using (false) with check (false);
