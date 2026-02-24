// netlify/functions/presence.js
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

const getPath = (event) => {
  let path = event.path || '';
  path = path.replace('/.netlify/functions/presence', '');
  path = path.replace('/api/presence', '');
  if (!path.startsWith('/')) path = '/' + path;
  if (path === '/') path = '';
  return path;
};

const getUserFromToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  
  const [session] = await sql`
    SELECT u.id, u.email, u.display_name
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.token = ${token} AND s.expires_at > NOW()
  `;
  
  return session || null;
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = getPath(event);
  const body = event.body ? JSON.parse(event.body) : {};
  const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);

  console.log('Presence function:', event.httpMethod, path);

  try {
    // POST /presence/heartbeat - Update presence
    if (event.httpMethod === 'POST' && path === '/heartbeat') {
      const { roomId, guestId, status } = body;

      if (!roomId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'roomId required' }) };
      }

      if (user) {
        await sql`
          UPDATE room_visitors 
          SET last_seen = NOW(), status = ${status || 'online'}
          WHERE room_id = ${roomId}::uuid AND user_id = ${user.id}
        `;
      } else if (guestId) {
        await sql`
          UPDATE room_visitors 
          SET last_seen = NOW(), status = ${status || 'online'}
          WHERE room_id = ${roomId}::uuid AND guest_id = ${guestId}
        `;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // POST /presence/leave - Leave room
    if (event.httpMethod === 'POST' && path === '/leave') {
      const { roomId, guestId } = body;

      if (!roomId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'roomId required' }) };
      }

      // Set status to offline AND set last_seen to past time to immediately exclude from online count
      if (user) {
        await sql`
          UPDATE room_visitors 
          SET status = 'offline', last_seen = NOW() - INTERVAL '1 hour'
          WHERE room_id = ${roomId}::uuid AND user_id = ${user.id}
        `;
      } else if (guestId) {
        await sql`
          UPDATE room_visitors 
          SET status = 'offline', last_seen = NOW() - INTERVAL '1 hour'
          WHERE room_id = ${roomId}::uuid AND guest_id = ${guestId}
        `;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /presence/member - Update member (rename, color)
    if (event.httpMethod === 'PUT' && path === '/member') {
      const { roomId, visitorId, guestId, displayName, color } = body;

      if (!roomId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'roomId required' }) };
      }

      if (visitorId) {
        await sql`
          UPDATE room_visitors 
          SET display_name = COALESCE(${displayName}, display_name),
              color = COALESCE(${color}, color)
          WHERE room_id = ${roomId}::uuid AND user_id = ${visitorId}
        `;
      } else if (guestId) {
        await sql`
          UPDATE room_visitors 
          SET display_name = COALESCE(${displayName}, display_name),
              color = COALESCE(${color}, color)
          WHERE room_id = ${roomId}::uuid AND guest_id = ${guestId}
        `;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // GET /presence/:roomId - Get room members
    const roomMatch = path.match(/^\/([^\/]+)$/);
    if (event.httpMethod === 'GET' && roomMatch) {
      const roomId = roomMatch[1];

      // Get room owner
      const [room] = await sql`SELECT owner_id FROM rooms WHERE id = ${roomId}::uuid`;

      // Get all members, determine status based on last_seen
      // Using longer intervals to account for browser throttling background tabs
      const members = await sql`
        SELECT 
          rv.user_id,
          rv.guest_id,
          rv.display_name,
          rv.color,
          rv.status,
          rv.last_seen,
          CASE WHEN rv.user_id = ${room?.owner_id || null} THEN true ELSE false END as is_owner,
          CASE 
            WHEN rv.last_seen > NOW() - INTERVAL '60 seconds' THEN 'online'
            WHEN rv.last_seen > NOW() - INTERVAL '5 minutes' THEN 'away'
            ELSE 'offline'
          END as computed_status
        FROM room_visitors rv
        WHERE rv.room_id = ${roomId}::uuid
        ORDER BY is_owner DESC, rv.display_name
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          members: members.map(m => ({
            visitorId: m.user_id || m.guest_id,
            visitorUserId: m.user_id,
            guestId: m.guest_id,
            displayName: m.display_name,
            color: m.color,
            status: m.computed_status,
            isOwner: m.is_owner,
            lastSeen: m.last_seen
          }))
        })
      };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Presence error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
