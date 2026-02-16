-- Craft Room Permissions Migration
-- Run on your existing Neon database

ALTER TABLE craft_room_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'viewer';
ALTER TABLE craft_room_members ADD COLUMN IF NOT EXISTS can_view_hidden BOOLEAN DEFAULT false;

-- Set existing owners to 'owner' role
UPDATE craft_room_members SET role = 'owner' WHERE is_owner = true;
