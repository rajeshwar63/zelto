-- Create otp_codes table for MSG91 WhatsApp OTP verification
create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  phone_number text not null unique,
  otp_code text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Enable Row Level Security
alter table public.otp_codes enable row level security;

-- Only service role can access this table (edge functions use service role key)
-- No public policies needed
