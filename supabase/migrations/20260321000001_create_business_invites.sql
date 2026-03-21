CREATE TABLE IF NOT EXISTS business_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_entity_id UUID NOT NULL REFERENCES business_entities(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES user_accounts(id),
  invite_type TEXT NOT NULL CHECK (invite_type IN ('link', 'email')),
  invite_code TEXT NOT NULL UNIQUE,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  accepted_by UUID REFERENCES user_accounts(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
