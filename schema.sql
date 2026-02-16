-- Multiview.video Database Schema for Neon PostgreSQL

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  username VARCHAR(100) UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255), -- NULL for Google OAuth users
  avatar_url TEXT,
  auth_provider VARCHAR(20) DEFAULT 'email', -- 'email' or 'google'
  google_id VARCHAR(255) UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions table for auth tokens
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Playlists table
CREATE TABLE IF NOT EXISTS playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID REFERENCES playlists(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  video_type VARCHAR(50) NOT NULL, -- youtube, spotify, vimeo, soundcloud, direct
  thumbnail_url TEXT,
  duration INTEGER, -- in seconds
  position INTEGER DEFAULT 0,
  notes TEXT, -- Optional notes for the video
  notes_updated_by VARCHAR(255), -- Who last edited the notes (display name)
  notes_updated_at TIMESTAMP WITH TIME ZONE, -- When notes were last edited
  notes_hidden BOOLEAN DEFAULT false, -- Owner can hide notes for this video from guests
  added_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Uploaded files table (stores files directly in database as base64)
CREATE TABLE IF NOT EXISTS uploaded_files (
  id VARCHAR(100) PRIMARY KEY, -- Unique file ID (timestamp_random)
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  content_type VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL, -- 'audio' or 'video'
  data TEXT NOT NULL, -- Base64 encoded file data
  size INTEGER NOT NULL, -- File size in bytes
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room members (for tracking who's in a room)
CREATE TABLE IF NOT EXISTS room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100), -- For guest users without accounts
  display_name VARCHAR(100) NOT NULL,
  color VARCHAR(20), -- Badge color
  is_owner BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, guest_id)
);

-- Presence tracking (who's currently online)
CREATE TABLE IF NOT EXISTS presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'online', -- online, away, offline
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, guest_id)
);

-- Kicked users (to prevent rejoining)
CREATE TABLE IF NOT EXISTS kicked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100),
  kicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  kicked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(room_id, user_id),
  UNIQUE(room_id, guest_id)
);

-- Visitor names (saved display names for visitors)
CREATE TABLE IF NOT EXISTS visitor_names (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  visitor_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100),
  display_name VARCHAR(100) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(host_id, visitor_id),
  UNIQUE(host_id, guest_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_playlists_room ON playlists(room_id);
CREATE INDEX IF NOT EXISTS idx_videos_playlist ON videos(playlist_id);
CREATE INDEX IF NOT EXISTS idx_room_members_room ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_presence_room ON presence(room_id);
CREATE INDEX IF NOT EXISTS idx_presence_last_seen ON presence(last_seen);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_playlists_updated_at ON playlists;
CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON playlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
