-- `Agent.socialAccounts`: the social media logins the company keeps for an
-- agent, as a JSON array of `{ platform, username, password }`. Managed by
-- admins only; an empty array rather than null, so every agent reads the same.
ALTER TABLE "Agent" ADD COLUMN "socialAccounts" JSONB NOT NULL DEFAULT '[]';
