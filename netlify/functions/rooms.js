// netlify/functions/rooms.js
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
  path = path.replace('/.netlify/functions/rooms', '');
  path = path.replace('/api/rooms', '');
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

  console.log('Rooms function:', event.httpMethod, path, 'User:', user?.id);

  try {
    // GET /rooms - List user's rooms
    if (event.httpMethod === 'GET' && path === '') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const rooms = await sql`
        SELECT r.id, r.name, r.description, r.is_public, r.created_at,
               (SELECT COUNT(*) FROM playlists WHERE room_id = r.id) as playlist_count,
               (SELECT COUNT(*) FROM room_visitors 
                WHERE room_id = r.id 
                  AND status != 'offline' 
                  AND last_seen > NOW() - INTERVAL '15 seconds') as online_count
        FROM rooms r
        WHERE r.owner_id = ${user.id}
        ORDER BY r.created_at DESC
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ rooms: rooms.map(r => ({ ...r, ownerId: user.id, onlineCount: parseInt(r.online_count) || 0 })) })
      };
    }

    // GET /rooms/visited - List rooms user has visited (but doesn't own)
    if (event.httpMethod === 'GET' && path === '/visited') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const visitedRooms = await sql`
        SELECT DISTINCT r.id, r.name, r.owner_id, u.display_name as owner_name,
               rv.last_seen as last_visited,
               (SELECT COUNT(*) FROM room_visitors 
                WHERE room_id = r.id 
                  AND status != 'offline' 
                  AND last_seen > NOW() - INTERVAL '15 seconds') as online_count
        FROM room_visitors rv
        JOIN rooms r ON rv.room_id = r.id
        JOIN users u ON r.owner_id = u.id
        WHERE rv.user_id = ${user.id}
          AND r.owner_id != ${user.id}
        ORDER BY rv.last_seen DESC
        LIMIT 20
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          rooms: visitedRooms.map(r => ({
            id: r.id,
            name: r.name,
            ownerId: r.owner_id,
            ownerName: r.owner_name,
            lastVisited: r.last_visited,
            onlineCount: parseInt(r.online_count) || 0
          }))
        })
      };
    }

    // DELETE /rooms/visited/:roomId - Remove room from visited history
    const visitedDeleteMatch = path.match(/^\/visited\/([^\/]+)$/);
    if (event.httpMethod === 'DELETE' && visitedDeleteMatch) {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const roomId = visitedDeleteMatch[1];
      
      await sql`
        DELETE FROM room_visitors 
        WHERE room_id = ${roomId}::uuid AND user_id = ${user.id}
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // GET /rooms/my-playlists - Get all playlists from user's owned rooms (for cross-room import)
    if (event.httpMethod === 'GET' && path === '/my-playlists') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      // Get all rooms the user owns with their playlists
      const roomsWithPlaylists = await sql`
        SELECT 
          r.id as room_id,
          r.name as room_name,
          p.id as playlist_id,
          p.name as playlist_name,
          (SELECT COUNT(*) FROM videos WHERE playlist_id = p.id) as video_count
        FROM rooms r
        LEFT JOIN playlists p ON p.room_id = r.id
        WHERE r.owner_id = ${user.id}
        ORDER BY r.name, p.name
      `;

      // Group by room
      const roomsMap = {};
      for (const row of roomsWithPlaylists) {
        if (!roomsMap[row.room_id]) {
          roomsMap[row.room_id] = {
            id: row.room_id,
            name: row.room_name,
            playlists: []
          };
        }
        if (row.playlist_id) {
          roomsMap[row.room_id].playlists.push({
            id: row.playlist_id,
            name: row.playlist_name,
            videoCount: parseInt(row.video_count) || 0
          });
        }
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ rooms: Object.values(roomsMap) })
      };
    }

    // POST /rooms - Create room
    if (event.httpMethod === 'POST' && path === '') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const { name, description, isPublic } = body;
      if (!name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Name required' }) };
      }

      const [room] = await sql`
        INSERT INTO rooms (owner_id, name, description, is_public)
        VALUES (${user.id}, ${name}, ${description || null}, ${isPublic || false})
        RETURNING id, name, description, is_public, created_at
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ room: { ...room, ownerId: user.id } })
      };
    }

    // Extract room ID from path
    const roomMatch = path.match(/^\/([^\/]+)(\/.*)?$/);
    if (!roomMatch) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    const roomId = roomMatch[1];
    const subPath = roomMatch[2] || '';

    // GET /rooms/:id - Get room
    if (event.httpMethod === 'GET' && subPath === '') {
      const [room] = await sql`
        SELECT r.id, r.name, r.description, r.is_public, r.owner_id, r.created_at,
               u.display_name as owner_name
        FROM rooms r
        JOIN users u ON r.owner_id = u.id
        WHERE r.id = ${roomId}::uuid
      `;

      if (!room) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Room not found' }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ room: { ...room, ownerId: room.owner_id, ownerName: room.owner_name } })
      };
    }

    // PUT /rooms/:id - Update room
    if (event.httpMethod === 'PUT' && subPath === '') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const [room] = await sql`SELECT owner_id FROM rooms WHERE id = ${roomId}::uuid`;
      if (!room) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Room not found' }) };
      }
      if (room.owner_id !== user.id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not your room' }) };
      }

      const { name, description, isPublic } = body;
      const [updated] = await sql`
        UPDATE rooms 
        SET name = COALESCE(${name}, name),
            description = COALESCE(${description}, description),
            is_public = COALESCE(${isPublic}, is_public)
        WHERE id = ${roomId}::uuid
        RETURNING id, name, description, is_public, created_at
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ room: { ...updated, ownerId: user.id } })
      };
    }

    // DELETE /rooms/:id - Delete room
    if (event.httpMethod === 'DELETE' && subPath === '') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const [room] = await sql`SELECT owner_id FROM rooms WHERE id = ${roomId}::uuid`;
      if (!room) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Room not found' }) };
      }
      if (room.owner_id !== user.id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not your room' }) };
      }

      await sql`DELETE FROM rooms WHERE id = ${roomId}::uuid`;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // POST /rooms/:id/join - Join room
    if (event.httpMethod === 'POST' && subPath === '/join') {
      const { displayName, guestId, returningGuestName } = body;

      const [room] = await sql`SELECT id, owner_id FROM rooms WHERE id = ${roomId}::uuid`;
      if (!room) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Room not found' }) };
      }

      let effectiveGuestId = guestId;
      let existingDisplayName = displayName;

      // If returning guest, try to find their previous session by name
      if (!user && returningGuestName) {
        const [existingGuest] = await sql`
          SELECT guest_id, display_name, color FROM room_visitors 
          WHERE room_id = ${roomId}::uuid 
          AND guest_id IS NOT NULL 
          AND LOWER(display_name) = LOWER(${returningGuestName})
          ORDER BY last_seen DESC
          LIMIT 1
        `;
        if (existingGuest) {
          effectiveGuestId = existingGuest.guest_id;
          existingDisplayName = existingGuest.display_name;
        }
      }

      // Upsert room visitor - use DELETE then INSERT for reliability
      if (user) {
        // Check if exists
        const [existing] = await sql`
          SELECT id FROM room_visitors WHERE room_id = ${roomId}::uuid AND user_id = ${user.id}
        `;
        if (existing) {
          await sql`
            UPDATE room_visitors 
            SET display_name = ${displayName || user.display_name}, last_seen = NOW(), status = 'online'
            WHERE room_id = ${roomId}::uuid AND user_id = ${user.id}
          `;
        } else {
          await sql`
            INSERT INTO room_visitors (room_id, user_id, display_name, last_seen, status)
            VALUES (${roomId}::uuid, ${user.id}, ${displayName || user.display_name}, NOW(), 'online')
          `;
        }
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
      } else if (effectiveGuestId) {
        const [existing] = await sql`
          SELECT id, display_name FROM room_visitors WHERE room_id = ${roomId}::uuid AND guest_id = ${effectiveGuestId}
        `;
        if (existing) {
          // Keep the existing display name for this room if not provided
          const nameToUse = displayName || existing.display_name || 'Guest';
          await sql`
            UPDATE room_visitors 
            SET display_name = ${nameToUse}, last_seen = NOW(), status = 'online'
            WHERE room_id = ${roomId}::uuid AND guest_id = ${effectiveGuestId}
          `;
        } else {
          await sql`
            INSERT INTO room_visitors (room_id, guest_id, display_name, last_seen, status)
            VALUES (${roomId}::uuid, ${effectiveGuestId}, ${existingDisplayName || 'Guest'}, NOW(), 'online')
          `;
        }
        // Return the effective guest ID so client can use it
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, guestId: effectiveGuestId }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // POST /rooms/:id/kick - Kick user
    if (event.httpMethod === 'POST' && subPath === '/kick') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const [room] = await sql`SELECT owner_id FROM rooms WHERE id = ${roomId}::uuid`;
      if (!room || room.owner_id !== user.id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Not room owner' }) };
      }

      const { visitorId, guestId } = body;
      
      if (visitorId) {
        await sql`DELETE FROM room_visitors WHERE room_id = ${roomId}::uuid AND user_id = ${visitorId}`;
      } else if (guestId) {
        await sql`DELETE FROM room_visitors WHERE room_id = ${roomId}::uuid AND guest_id = ${guestId}`;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // GET /rooms/:id/sync - Get full room state for sync
    if (event.httpMethod === 'GET' && subPath === '/sync') {
      const [room] = await sql`
        SELECT r.id, r.name, r.owner_id, r.current_video_url, r.current_video_title, 
               r.current_playlist_id, r.playback_updated_at,
               r.playback_state, r.playback_time,
               COALESCE(r.autoplay, true) as autoplay,
               COALESCE(r.shuffle, false) as shuffle,
               COALESCE(r.loop_mode, false) as loop_mode,
               COALESCE(r.hide_notes, false) as hide_notes,
               u.display_name as owner_name
        FROM rooms r
        JOIN users u ON r.owner_id = u.id
        WHERE r.id = ${roomId}::uuid
      `;

      if (!room) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Room not found' }) };
      }

      const isOwner = user && user.id === room.owner_id;

      // Get playlists with videos (filter hidden for non-owners)
      let playlists;
      if (isOwner) {
        playlists = await sql`
          SELECT p.id, p.name, p.position, p.created_at, COALESCE(p.hidden, false) as hidden,
                 COALESCE(
                   json_agg(
                     json_build_object(
                       'id', v.id,
                       'title', v.title,
                       'url', v.url,
                       'videoType', v.video_type,
                       'position', v.position,
                       'notes', v.notes,
                       'notesUpdatedBy', v.notes_updated_by,
                       'notesUpdatedAt', v.notes_updated_at,
                       'notesHidden', COALESCE(v.notes_hidden, false)
                     ) ORDER BY v.position
                   ) FILTER (WHERE v.id IS NOT NULL),
                   '[]'
                 ) as videos
          FROM playlists p
          LEFT JOIN videos v ON v.playlist_id = p.id
          WHERE p.room_id = ${roomId}::uuid
          GROUP BY p.id
          ORDER BY p.position, p.created_at
        `;
      } else {
        playlists = await sql`
          SELECT p.id, p.name, p.position, p.created_at, COALESCE(p.hidden, false) as hidden,
                 COALESCE(
                   json_agg(
                     json_build_object(
                       'id', v.id,
                       'title', v.title,
                       'url', v.url,
                       'videoType', v.video_type,
                       'position', v.position,
                       'notes', v.notes,
                       'notesUpdatedBy', v.notes_updated_by,
                       'notesUpdatedAt', v.notes_updated_at,
                       'notesHidden', COALESCE(v.notes_hidden, false)
                     ) ORDER BY v.position
                   ) FILTER (WHERE v.id IS NOT NULL),
                   '[]'
                 ) as videos
          FROM playlists p
          LEFT JOIN videos v ON v.playlist_id = p.id
          WHERE p.room_id = ${roomId}::uuid AND (p.hidden IS NULL OR p.hidden = false)
          GROUP BY p.id
          ORDER BY p.position, p.created_at
        `;
      }

      // Get members with computed status
      // Users are "online" only if:
      // 1. Their status is 'online' (set by join, cleared by leave)
      // 2. AND they sent a heartbeat in the last 10 seconds
      // This ensures users in different rooms show as offline
      const members = await sql`
        SELECT rv.user_id, rv.guest_id, rv.display_name, rv.color, rv.status, rv.last_seen,
               CASE WHEN rv.user_id = ${room.owner_id} THEN true ELSE false END as is_owner,
               CASE 
                 WHEN rv.status = 'online' AND rv.last_seen > NOW() - INTERVAL '10 seconds' THEN 'online'
                 ELSE 'offline'
               END as computed_status
        FROM room_visitors rv
        WHERE rv.room_id = ${roomId}::uuid
        ORDER BY is_owner DESC, rv.display_name
      `;

      // Calculate actual current playback time
      // If video is playing, add elapsed time since last update
      let currentPlaybackTime = room.playback_time || 0;
      if (room.playback_state === 'playing' && room.playback_updated_at) {
        const elapsedSeconds = (Date.now() - new Date(room.playback_updated_at).getTime()) / 1000;
        currentPlaybackTime = (room.playback_time || 0) + elapsedSeconds;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          room: {
            id: room.id,
            name: room.name,
            ownerId: room.owner_id,
            ownerName: room.owner_name,
            currentVideoUrl: room.current_video_url,
            currentVideoTitle: room.current_video_title,
            currentPlaylistId: room.current_playlist_id,
            playbackUpdatedAt: room.playback_updated_at,
            playbackState: room.playback_state || 'paused',
            playbackTime: currentPlaybackTime,
            autoplay: room.autoplay !== false,
            shuffle: room.shuffle === true,
            loop: room.loop_mode === true,
            hideNotes: room.hide_notes === true
          },
          playlists,
          isPlaylistOwner: isOwner,
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

    // PUT /rooms/:id/sync - Update room playback state
    if (event.httpMethod === 'PUT' && subPath === '/sync') {
      const { currentVideoUrl, currentVideoTitle, currentPlaylistId, playbackState, playbackTime, autoplay, shuffle, loop } = body;

      // Check if this is a playlist-only update (no video/playback fields)
      const isPlaylistOnlyUpdate = currentPlaylistId !== undefined && 
        currentVideoUrl === undefined && 
        playbackState === undefined && 
        playbackTime === undefined;
      
      if (isPlaylistOnlyUpdate) {
        // Just update the playlist without affecting video/playback
        await sql`
          UPDATE rooms 
          SET current_playlist_id = ${currentPlaylistId || null}
          WHERE id = ${roomId}::uuid
        `;
      } else {
        // Full update including video state
        await sql`
          UPDATE rooms 
          SET current_video_url = ${currentVideoUrl || null},
              current_video_title = ${currentVideoTitle || null},
              current_playlist_id = ${currentPlaylistId || null},
              playback_state = ${playbackState || 'paused'},
              playback_time = ${playbackTime || 0},
              playback_updated_at = NOW(),
              autoplay = COALESCE(${autoplay}, autoplay),
              shuffle = COALESCE(${shuffle}, shuffle),
              loop_mode = COALESCE(${loop}, loop_mode)
          WHERE id = ${roomId}::uuid
        `;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /rooms/:id/options - Update just the playback options (autoplay, shuffle, loop, hideNotes)
    if (event.httpMethod === 'PUT' && subPath === '/options') {
      const { autoplay, shuffle, loop, hideNotes } = body;

      await sql`
        UPDATE rooms 
        SET autoplay = COALESCE(${autoplay}, autoplay),
            shuffle = COALESCE(${shuffle}, shuffle),
            loop_mode = COALESCE(${loop}, loop_mode),
            hide_notes = COALESCE(${hideNotes}, hide_notes)
        WHERE id = ${roomId}::uuid
      `;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, autoplay, shuffle, loop, hideNotes }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Rooms error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
