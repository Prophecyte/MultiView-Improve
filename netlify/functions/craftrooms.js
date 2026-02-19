// netlify/functions/craftrooms.js
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

// Auto-migrate: add role/can_view_hidden if missing
let migrated = false;
async function ensureMigration() {
  if (migrated) return;
  try {
    await sql`ALTER TABLE craft_room_members ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'viewer'`;
    await sql`ALTER TABLE craft_room_members ADD COLUMN IF NOT EXISTS can_view_hidden BOOLEAN DEFAULT false`;
    await sql`UPDATE craft_room_members SET role = 'owner' WHERE is_owner = true AND (role IS NULL OR role = 'viewer')`;
  } catch(e) { /* columns may already exist */ }
  migrated = true;
}

const getPath = (event) => {
  let path = event.path || '';
  path = path.replace('/.netlify/functions/craftrooms', '');
  path = path.replace('/api/craftrooms', '');
  if (!path.startsWith('/')) path = '/' + path;
  if (path === '/') path = '';
  return path;
};

const getUserFromToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  const [session] = await sql`
    SELECT u.id, u.email, u.username, u.display_name, u.avatar_url
    FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token} AND s.expires_at > NOW()
  `;
  return session || null;
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    await ensureMigration();
    const path = getPath(event);
    const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
    const body = event.body ? JSON.parse(event.body) : {};

    // ─── POST / - Create craft room ───
    if (event.httpMethod === 'POST' && path === '') {
      if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
      const { name, description } = body;
      if (!name?.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name required' }) };

      const [room] = await sql`
        INSERT INTO craft_rooms (owner_id, name, description, state)
        VALUES (${user.id}, ${name.trim()}, ${description || null}, ${JSON.stringify({
          boards: [{ id: 'board_default', name: 'Board 1', cards: [], connections: [] }],
          currentBoardId: 'board_default',
          maps: [{ id: 'map_default', name: 'Map 1', pins: [], image: null }],
          currentMapId: 'map_default',
          chapters: [{ id: 'ch_default', label: 'Chapter 1', title: 'Chapter 1', content: '', words: 0 }],
          currentChapterId: 'ch_default',
          associations: [],
          destinationMarkers: [],
          currentView: 'board',
          diceHistory: [],
          viewSettings: { board: true, write: true, map: true, timeline: true, combat: true, factions: true, mindmap: true, soundboard: true },
          combatants: [], combatRound: 0, combatTurnIndex: -1, combatActive: false, savedEncounters: [],
          factions: [], contacts: [], organizations: [],
          timelines: [],
          mmNodes: [], mmEdges: [],
          sbSoundscapes: [],
          sbPlaylists: [],
          sbCustomSounds: []
        })})
        RETURNING id, name, description, owner_id, created_at
      `;
      // Auto-join as owner
      await sql`
        INSERT INTO craft_room_members (craft_room_id, user_id, display_name, is_owner, role)
        VALUES (${room.id}, ${user.id}, ${user.display_name}, true, 'owner')
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ room }) };
    }

    // ─── GET / - List my craft rooms ───
    if (event.httpMethod === 'GET' && path === '') {
      if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
      const rooms = await sql`
        SELECT cr.id, cr.name, cr.description, cr.owner_id, cr.created_at, cr.updated_at,
               u.display_name as owner_name,
               (SELECT COUNT(*) FROM craft_room_members WHERE craft_room_id = cr.id) as member_count,
               (SELECT COUNT(*) FROM craft_room_presence WHERE craft_room_id = cr.id AND last_seen > NOW() - INTERVAL '30 seconds') as online_count
        FROM craft_rooms cr
        JOIN users u ON cr.owner_id = u.id
        WHERE cr.owner_id = ${user.id}
           OR cr.id IN (SELECT craft_room_id FROM craft_room_members WHERE user_id = ${user.id})
        ORDER BY cr.updated_at DESC
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ rooms }) };
    }

    // ─── Routes with room ID ───
    const idMatch = path.match(/^\/([a-f0-9-]+)(\/.*)?$/);
    if (!idMatch) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

    const roomId = idMatch[1];
    const subPath = idMatch[2] || '';

    // ─── GET /:id - Get room details ───
    if (event.httpMethod === 'GET' && subPath === '') {
      const [room] = await sql`
        SELECT cr.id, cr.name, cr.description, cr.owner_id, cr.is_public, cr.created_at,
               u.display_name as owner_name
        FROM craft_rooms cr JOIN users u ON cr.owner_id = u.id
        WHERE cr.id = ${roomId}
      `;
      if (!room) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Room not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify({ room }) };
    }

    // ─── DELETE /:id - Delete room ───
    if (event.httpMethod === 'DELETE' && subPath === '') {
      if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
      const [room] = await sql`SELECT owner_id FROM craft_rooms WHERE id = ${roomId}`;
      if (!room || room.owner_id !== user.id) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not owner' }) };
      await sql`DELETE FROM craft_rooms WHERE id = ${roomId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── PUT /:id/name - Rename room ───
    if (event.httpMethod === 'PUT' && subPath === '/name') {
      if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
      const [room] = await sql`SELECT owner_id FROM craft_rooms WHERE id = ${roomId}`;
      if (!room || room.owner_id !== user.id) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not owner' }) };
      const { name } = body;
      if (!name?.trim()) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name required' }) };
      await sql`UPDATE craft_rooms SET name = ${name.trim()} WHERE id = ${roomId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── GET /:id/version - Lightweight version check ───
    if (event.httpMethod === 'GET' && subPath === '/version') {
      const [room] = await sql`
        SELECT state_version, active_view, updated_at FROM craft_rooms WHERE id = ${roomId}
      `;
      if (!room) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
      return { statusCode: 200, headers, body: JSON.stringify({
        version: room.state_version,
        activeView: room.active_view,
        updatedAt: room.updated_at
      }) };
    }

    // ─── GET /:id/sync - Full state pull ───
    if (event.httpMethod === 'GET' && subPath === '/sync') {
      const [room] = await sql`
        SELECT state_version, state, active_view, updated_at FROM craft_rooms WHERE id = ${roomId}
      `;
      if (!room) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

      // Get members with online status
      const members = await sql`
        SELECT m.display_name, m.color, m.is_owner, m.user_id, m.guest_id, m.role, m.can_view_hidden,
               CASE WHEN p.last_seen > NOW() - INTERVAL '30 seconds' THEN 'online' ELSE 'offline' END as status,
               COALESCE(p.active_view, 'board') as active_view
        FROM craft_room_members m
        LEFT JOIN craft_room_presence p ON (
          (m.user_id IS NOT NULL AND m.user_id = p.user_id AND m.craft_room_id = p.craft_room_id) OR
          (m.guest_id IS NOT NULL AND m.guest_id = p.guest_id AND m.craft_room_id = p.craft_room_id)
        )
        WHERE m.craft_room_id = ${roomId}
        ORDER BY m.is_owner DESC, m.display_name
      `;

      return { statusCode: 200, headers, body: JSON.stringify({
        version: room.state_version,
        state: room.state,
        activeView: room.active_view,
        updatedAt: room.updated_at,
        members
      }) };
    }

    // ─── PUT /:id/sync - Push state update ───
    if (event.httpMethod === 'PUT' && subPath === '/sync') {
      // Check membership and role
      let member = null;
      if (user) {
        const [m] = await sql`
          SELECT is_owner, role FROM craft_room_members
          WHERE craft_room_id = ${roomId} AND user_id = ${user.id}
        `;
        member = m;
      } else if (body.guestId) {
        const [m] = await sql`
          SELECT is_owner, role FROM craft_room_members
          WHERE craft_room_id = ${roomId} AND guest_id = ${body.guestId}
        `;
        member = m;
      }
      if (!member) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not a member' }) };
      if (!member.is_owner && member.role !== 'editor') {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'View only - no edit permission' }) };
      }

      const { state, activeView } = body;

      if (state) {
        await sql`
          UPDATE craft_rooms SET
            state = ${JSON.stringify(state)},
            active_view = ${activeView || 'cards'},
            state_version = state_version + 1
          WHERE id = ${roomId}
        `;
      } else if (activeView) {
        await sql`
          UPDATE craft_rooms SET active_view = ${activeView}
          WHERE id = ${roomId}
        `;
      }

      const [updated] = await sql`SELECT state_version FROM craft_rooms WHERE id = ${roomId}`;
      return { statusCode: 200, headers, body: JSON.stringify({ version: updated.state_version }) };
    }

    // ─── POST /:id/join - Join room ───
    if (event.httpMethod === 'POST' && subPath === '/join') {
      const displayName = body.displayName;
      const guestId = body.guestId;
      if (!displayName) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Display name required' }) };

      // Check if kicked
      if (user) {
        const [kicked] = await sql`SELECT id FROM craft_room_kicked WHERE craft_room_id = ${roomId} AND user_id = ${user.id}`;
        if (kicked) return { statusCode: 403, headers, body: JSON.stringify({ error: 'You have been kicked from this room' }) };
      } else if (guestId) {
        const [kicked] = await sql`SELECT id FROM craft_room_kicked WHERE craft_room_id = ${roomId} AND guest_id = ${guestId}`;
        if (kicked) return { statusCode: 403, headers, body: JSON.stringify({ error: 'You have been kicked from this room' }) };
      }

      if (user) {
        await sql`
          INSERT INTO craft_room_members (craft_room_id, user_id, display_name, is_owner, role)
          VALUES (${roomId}, ${user.id}, ${displayName}, false, 'viewer')
          ON CONFLICT (craft_room_id, user_id) DO UPDATE SET display_name = ${displayName}
        `;
        // Update presence
        await sql`
          INSERT INTO craft_room_presence (craft_room_id, user_id, status, last_seen)
          VALUES (${roomId}, ${user.id}, 'online', NOW())
          ON CONFLICT (craft_room_id, user_id) DO UPDATE SET status = 'online', last_seen = NOW()
        `;
      } else if (guestId) {
        await sql`
          INSERT INTO craft_room_members (craft_room_id, guest_id, display_name, is_owner, role)
          VALUES (${roomId}, ${guestId}, ${displayName}, false, 'viewer')
          ON CONFLICT (craft_room_id, guest_id) DO UPDATE SET display_name = ${displayName}
        `;
        await sql`
          INSERT INTO craft_room_presence (craft_room_id, guest_id, status, last_seen)
          VALUES (${roomId}, ${guestId}, 'online', NOW())
          ON CONFLICT (craft_room_id, guest_id) DO UPDATE SET status = 'online', last_seen = NOW()
        `;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── POST /:id/leave - Leave room (keep membership, just go offline) ───
    if (event.httpMethod === 'POST' && subPath === '/leave') {
      if (user) {
        await sql`DELETE FROM craft_room_presence WHERE craft_room_id = ${roomId} AND user_id = ${user.id}`;
      } else if (body.guestId) {
        await sql`DELETE FROM craft_room_presence WHERE craft_room_id = ${roomId} AND guest_id = ${body.guestId}`;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── POST /:id/heartbeat - Presence heartbeat ───
    if (event.httpMethod === 'POST' && subPath === '/heartbeat') {
      // Check if kicked
      if (user) {
        const [kicked] = await sql`SELECT id FROM craft_room_kicked WHERE craft_room_id = ${roomId} AND user_id = ${user.id}`;
        if (kicked) return { statusCode: 403, headers, body: JSON.stringify({ error: 'kicked', kicked: true }) };
      } else if (body.guestId) {
        const [kicked] = await sql`SELECT id FROM craft_room_kicked WHERE craft_room_id = ${roomId} AND guest_id = ${body.guestId}`;
        if (kicked) return { statusCode: 403, headers, body: JSON.stringify({ error: 'kicked', kicked: true }) };
      }

      const av = body.activeView || 'board';
      if (user) {
        await sql`
          INSERT INTO craft_room_presence (craft_room_id, user_id, status, last_seen, active_view)
          VALUES (${roomId}, ${user.id}, 'online', NOW(), ${av})
          ON CONFLICT (craft_room_id, user_id) DO UPDATE SET status = 'online', last_seen = NOW(), active_view = ${av}
        `;
      } else if (body.guestId) {
        await sql`
          INSERT INTO craft_room_presence (craft_room_id, guest_id, status, last_seen, active_view)
          VALUES (${roomId}, ${body.guestId}, 'online', NOW(), ${av})
          ON CONFLICT (craft_room_id, guest_id) DO UPDATE SET status = 'online', last_seen = NOW(), active_view = ${av}
        `;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── GET /:id/members - List members ───
    if (event.httpMethod === 'GET' && subPath === '/members') {
      const members = await sql`
        SELECT m.display_name, m.color, m.is_owner, m.user_id, m.guest_id, m.role, m.can_view_hidden,
               CASE WHEN p.last_seen > NOW() - INTERVAL '30 seconds' THEN 'online' ELSE 'offline' END as status,
               COALESCE(p.active_view, 'board') as active_view
        FROM craft_room_members m
        LEFT JOIN craft_room_presence p ON (
          (m.user_id IS NOT NULL AND m.user_id = p.user_id AND m.craft_room_id = p.craft_room_id) OR
          (m.guest_id IS NOT NULL AND m.guest_id = p.guest_id AND m.craft_room_id = p.craft_room_id)
        )
        WHERE m.craft_room_id = ${roomId}
        ORDER BY m.is_owner DESC, m.display_name
      `;
      return { statusCode: 200, headers, body: JSON.stringify({ members }) };
    }

    // ─── PUT /:id/permissions - Update member permissions (owner only) ───
    if (event.httpMethod === 'PUT' && subPath === '/permissions') {
      if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
      const [room] = await sql`SELECT owner_id FROM craft_rooms WHERE id = ${roomId}`;
      if (!room || room.owner_id !== user.id) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not owner' }) };

      const { targetUserId, targetGuestId, role, canViewHidden } = body;
      
      if (role !== undefined) {
        if (!['viewer', 'editor'].includes(role)) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid role' }) };
        if (targetUserId) {
          await sql`UPDATE craft_room_members SET role = ${role} WHERE craft_room_id = ${roomId} AND user_id = ${targetUserId}`;
        } else if (targetGuestId) {
          await sql`UPDATE craft_room_members SET role = ${role} WHERE craft_room_id = ${roomId} AND guest_id = ${targetGuestId}`;
        }
      }
      
      if (canViewHidden !== undefined) {
        if (targetUserId) {
          await sql`UPDATE craft_room_members SET can_view_hidden = ${!!canViewHidden} WHERE craft_room_id = ${roomId} AND user_id = ${targetUserId}`;
        } else if (targetGuestId) {
          await sql`UPDATE craft_room_members SET can_view_hidden = ${!!canViewHidden} WHERE craft_room_id = ${roomId} AND guest_id = ${targetGuestId}`;
        }
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── PUT /:id/member - Update member display name / color ───
    if (event.httpMethod === 'PUT' && subPath === '/member') {
      const { targetUserId, targetGuestId, displayName, color } = body;
      // Auth: must be owner, editor, or editing yourself
      const myId = user ? user.id : null;
      const myGid = body.myGuestId || null;
      let allowed = false;
      if (user) {
        const [room] = await sql`SELECT owner_id FROM craft_rooms WHERE id = ${roomId}`;
        if (room && room.owner_id === user.id) allowed = true;
        const [me] = await sql`SELECT role FROM craft_room_members WHERE craft_room_id = ${roomId} AND user_id = ${user.id}`;
        if (me && me.role === 'editor') allowed = true;
        if (targetUserId && targetUserId === user.id) allowed = true;
      } else if (myGid) {
        const [me] = await sql`SELECT role FROM craft_room_members WHERE craft_room_id = ${roomId} AND guest_id = ${myGid}`;
        if (me && me.role === 'editor') allowed = true;
        if (targetGuestId && targetGuestId === myGid) allowed = true;
      }
      if (!allowed) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not allowed' }) };

      if (targetUserId) {
        await sql`UPDATE craft_room_members SET
          display_name = COALESCE(${displayName || null}, display_name),
          color = COALESCE(${color || null}, color)
          WHERE craft_room_id = ${roomId} AND user_id = ${targetUserId}`;
      } else if (targetGuestId) {
        await sql`UPDATE craft_room_members SET
          display_name = COALESCE(${displayName || null}, display_name),
          color = COALESCE(${color || null}, color)
          WHERE craft_room_id = ${roomId} AND guest_id = ${targetGuestId}`;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // ─── POST /:id/kick - Kick member ───
    if (event.httpMethod === 'POST' && subPath === '/kick') {
      if (!user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Login required' }) };
      const [room] = await sql`SELECT owner_id FROM craft_rooms WHERE id = ${roomId}`;
      if (!room || room.owner_id !== user.id) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not owner' }) };

      const { userId: kickUserId, guestId: kickGuestId } = body;
      if (kickUserId) {
        await sql`DELETE FROM craft_room_members WHERE craft_room_id = ${roomId} AND user_id = ${kickUserId}`;
        await sql`DELETE FROM craft_room_presence WHERE craft_room_id = ${roomId} AND user_id = ${kickUserId}`;
        await sql`INSERT INTO craft_room_kicked (craft_room_id, user_id, kicked_by) VALUES (${roomId}, ${kickUserId}, ${user.id}) ON CONFLICT DO NOTHING`;
      } else if (kickGuestId) {
        await sql`DELETE FROM craft_room_members WHERE craft_room_id = ${roomId} AND guest_id = ${kickGuestId}`;
        await sql`DELETE FROM craft_room_presence WHERE craft_room_id = ${roomId} AND guest_id = ${kickGuestId}`;
        await sql`INSERT INTO craft_room_kicked (craft_room_id, guest_id, kicked_by) VALUES (${roomId}, ${kickGuestId}, ${user.id}) ON CONFLICT DO NOTHING`;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Craft rooms error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message || 'Internal error' }) };
  }
};
