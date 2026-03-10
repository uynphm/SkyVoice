-- SkyVoice Database Schema
-- Run this in your Supabase SQL Editor to set up the persistence layer.

-- 1. Create the Sessions table
-- Stores the high-level state of a user's search session.
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chrome_id TEXT NOT NULL,          -- Unique ID from the Chrome Extension
    status TEXT DEFAULT 'ACTIVE',      -- 'ACTIVE', 'PAUSED', 'COMPLETED' (seat found)
    preferences JSONB DEFAULT '{}',    -- Extracted preferences like {"window": true, "max_price": 100}
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by Chrome ID when resuming
CREATE INDEX IF NOT EXISTS idx_sessions_chrome_id ON sessions(chrome_id);

-- 2. Create the Messages table
-- Stores the actual chatbot interaction history.
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,                -- 'USER', 'ASSISTANT', or 'SYSTEM'
    text TEXT NOT NULL,                -- The spoken/transcribed content
    metadata JSONB DEFAULT '{}',       -- Confidence scores, reasoning, or visual data
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Index to retrieve history in chronological order
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);

-- 3. Automatic "updated_at" Trigger Logic
-- Ensures 'updated_at' is refreshed every time the user's preferences or status change.
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE OR REPLACE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON sessions
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- 4. Enable Row Level Security (RLS)
-- (Important if you expose the DB directly to the extension in the future)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Basic policy: allow all access for now (simplify for hackathon)
-- In production, you would restrict this to authenticated users.
CREATE POLICY "Public full access" ON sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Public messages access" ON messages FOR ALL USING (true) WITH CHECK (true);
