-- ============================================
-- Migration: Add Craft Rooms to MultiView
-- Run this on your existing Neon PostgreSQL database
-- ============================================

-- Craft Rooms table (standalone, separate from video rooms)
CREATE TABLE IF NOT EXISTS craft_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_public BOOLEAN DEFAULT false,
  -- State sync: version increments on every save, clients poll version
  state_version INTEGER DEFAULT 0,
  -- Full craft room state as JSONB (cards, chapters, settings, etc.)
  state JSONB DEFAULT '{}',
  -- Active view tracking for sync
  active_view VARCHAR(20) DEFAULT 'cards',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Craft room members
CREATE TABLE IF NOT EXISTS craft_room_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  craft_room_id UUID REFERENCES craft_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100),
  display_name VARCHAR(100) NOT NULL,
  color VARCHAR(20),
  is_owner BOOLEAN DEFAULT false,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(craft_room_id, user_id),
  UNIQUE(craft_room_id, guest_id)
);

-- Craft room presence
CREATE TABLE IF NOT EXISTS craft_room_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  craft_room_id UUID REFERENCES craft_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100),
  status VARCHAR(20) DEFAULT 'online',
  last_seen TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(craft_room_id, user_id),
  UNIQUE(craft_room_id, guest_id)
);

-- Kicked users for craft rooms
CREATE TABLE IF NOT EXISTS craft_room_kicked (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  craft_room_id UUID REFERENCES craft_rooms(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  guest_id VARCHAR(100),
  kicked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  kicked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(craft_room_id, user_id),
  UNIQUE(craft_room_id, guest_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_craft_rooms_owner ON craft_rooms(owner_id);
CREATE INDEX IF NOT EXISTS idx_craft_room_members_room ON craft_room_members(craft_room_id);
CREATE INDEX IF NOT EXISTS idx_craft_room_presence_room ON craft_room_presence(craft_room_id);
CREATE INDEX IF NOT EXISTS idx_craft_rooms_version ON craft_rooms(state_version);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_craft_rooms_updated_at ON craft_rooms;
CREATE TRIGGER update_craft_rooms_updated_at BEFORE UPDATE ON craft_rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
