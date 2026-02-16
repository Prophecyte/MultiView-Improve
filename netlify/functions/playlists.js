// netlify/functions/playlists.js
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
  path = path.replace('/.netlify/functions/playlists', '');
  path = path.replace('/api/playlists', '');
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

// Ensure hidden column exists
const ensureHiddenColumn = async () => {
  try {
    await sql`ALTER TABLE playlists ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`;
  } catch (e) {
    // Column might already exist
  }
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = getPath(event);
  const body = event.body ? JSON.parse(event.body) : {};
  const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
  const query = event.queryStringParameters || {};

  console.log('Playlists function:', event.httpMethod, path);

  try {
    await ensureHiddenColumn();

    // GET /playlists?roomId=xxx - List playlists for room
    if (event.httpMethod === 'GET' && path === '') {
      const roomId = query.roomId;
      const includeHidden = query.includeHidden === 'true';
      
      if (!roomId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'roomId required' }) };
      }

      // Check if user is the room owner
      const [room] = await sql`SELECT owner_id FROM rooms WHERE id = ${roomId}::uuid`;
      const isOwner = room && user && room.owner_id === user.id;

      let playlists;
      if (isOwner || includeHidden) {
        // Owner sees all playlists including hidden
        playlists = await sql`
          SELECT p.id, p.name, p.position, p.created_at, COALESCE(p.hidden, false) as hidden,
                 COALESCE(
                   json_agg(
                     json_build_object(
                       'id', v.id,
                       'title', v.title,
                       'url', v.url,
                       'videoType', v.video_type,
                       'position', v.position
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
        // Non-owners only see non-hidden playlists
        playlists = await sql`
          SELECT p.id, p.name, p.position, p.created_at, COALESCE(p.hidden, false) as hidden,
                 COALESCE(
                   json_agg(
                     json_build_object(
                       'id', v.id,
                       'title', v.title,
                       'url', v.url,
                       'videoType', v.video_type,
                       'position', v.position
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

      return { statusCode: 200, headers, body: JSON.stringify({ playlists, isOwner }) };
    }

    // POST /playlists/import - Import playlist from another room
    if (event.httpMethod === 'POST' && path === '/import') {
      const { targetRoomId, playlist } = body;
      
      if (!targetRoomId || !playlist || !playlist.name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'targetRoomId and playlist data required' }) };
      }

      // Get max position
      const [maxPos] = await sql`SELECT COALESCE(MAX(position), -1) + 1 as pos FROM playlists WHERE room_id = ${targetRoomId}::uuid`;

      // Create playlist
      const [newPlaylist] = await sql`
        INSERT INTO playlists (room_id, name, position)
        VALUES (${targetRoomId}::uuid, ${playlist.name}, ${maxPos.pos})
        RETURNING id, name, position, created_at
      `;

      // Add videos
      const videos = playlist.videos || [];
      for (let i = 0; i < videos.length; i++) {
        const v = videos[i];
        await sql`
          INSERT INTO videos (playlist_id, title, url, video_type, position)
          VALUES (${newPlaylist.id}::uuid, ${v.title || v.url}, ${v.url}, ${v.videoType || 'youtube'}, ${i})
        `;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, playlistId: newPlaylist.id }) };
    }

    // POST /playlists/import-from-playlist - Import from an existing playlist ID (cross-room)
    if (event.httpMethod === 'POST' && path === '/import-from-playlist') {
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
      }

      const { sourcePlaylistId, targetRoomId } = body;
      
      if (!sourcePlaylistId || !targetRoomId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'sourcePlaylistId and targetRoomId required' }) };
      }

      // Verify user owns the source playlist's room
      const [sourcePlaylist] = await sql`
        SELECT p.id, p.name, r.owner_id
        FROM playlists p
        JOIN rooms r ON p.room_id = r.id
        WHERE p.id = ${sourcePlaylistId}::uuid
      `;

      if (!sourcePlaylist) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Source playlist not found' }) };
      }

      if (sourcePlaylist.owner_id !== user.id) {
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'You can only import from your own playlists' }) };
      }

      // Get source videos
      const sourceVideos = await sql`
        SELECT title, url, video_type
        FROM videos
        WHERE playlist_id = ${sourcePlaylistId}::uuid
        ORDER BY position
      `;

      // Get max position in target room
      const [maxPos] = await sql`SELECT COALESCE(MAX(position), -1) + 1 as pos FROM playlists WHERE room_id = ${targetRoomId}::uuid`;

      // Create new playlist in target room
      const [newPlaylist] = await sql`
        INSERT INTO playlists (room_id, name, position)
        VALUES (${targetRoomId}::uuid, ${sourcePlaylist.name}, ${maxPos.pos})
        RETURNING id, name, position, created_at
      `;

      // Copy videos
      for (let i = 0; i < sourceVideos.length; i++) {
        const v = sourceVideos[i];
        await sql`
          INSERT INTO videos (playlist_id, title, url, video_type, position)
          VALUES (${newPlaylist.id}::uuid, ${v.title}, ${v.url}, ${v.video_type || 'youtube'}, ${i})
        `;
      }

      return { 
        statusCode: 200, 
        headers, 
        body: JSON.stringify({ 
          success: true, 
          playlistId: newPlaylist.id,
          name: newPlaylist.name,
          videoCount: sourceVideos.length
        }) 
      };
    }

    // POST /playlists/:id/copy-video - Copy video to another playlist
    if (event.httpMethod === 'POST' && path.match(/^\/[^\/]+\/copy-video$/)) {
      const playlistId = path.split('/')[1];
      const { video } = body;
      
      if (!video || !video.url) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'video data required' }) };
      }

      const [maxPos] = await sql`SELECT COALESCE(MAX(position), -1) + 1 as pos FROM videos WHERE playlist_id = ${playlistId}::uuid`;

      const [newVideo] = await sql`
        INSERT INTO videos (playlist_id, title, url, video_type, position)
        VALUES (${playlistId}::uuid, ${video.title || video.url}, ${video.url}, ${video.videoType || 'youtube'}, ${maxPos.pos})
        RETURNING id, title, url, video_type as "videoType", position
      `;

      return { statusCode: 200, headers, body: JSON.stringify({ video: newVideo }) };
    }

    // PUT /playlists/reorder - Reorder playlists
    if (event.httpMethod === 'PUT' && path === '/reorder') {
      const { roomId, playlistIds } = body;
      
      if (!roomId || !Array.isArray(playlistIds)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'roomId and playlistIds array required' }) };
      }

      for (let i = 0; i < playlistIds.length; i++) {
        await sql`UPDATE playlists SET position = ${i} WHERE id = ${playlistIds[i]}::uuid AND room_id = ${roomId}::uuid`;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // POST /playlists - Create playlist
    if (event.httpMethod === 'POST' && path === '') {
      const { roomId, name } = body;
      
      if (!roomId || !name) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'roomId and name required' }) };
      }

      // Get max position
      const [maxPos] = await sql`SELECT COALESCE(MAX(position), -1) + 1 as pos FROM playlists WHERE room_id = ${roomId}::uuid`;

      const [playlist] = await sql`
        INSERT INTO playlists (room_id, name, position)
        VALUES (${roomId}::uuid, ${name}, ${maxPos.pos})
        RETURNING id, name, position, created_at
      `;

      return { statusCode: 200, headers, body: JSON.stringify({ playlist: { ...playlist, videos: [] } }) };
    }

    // Extract playlist ID from path
    const playlistMatch = path.match(/^\/([^\/]+)(\/.*)?$/);
    if (!playlistMatch) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };
    }

    const playlistId = playlistMatch[1];
    const subPath = playlistMatch[2] || '';

    // PUT /playlists/:id/hide - Toggle playlist visibility
    if (event.httpMethod === 'PUT' && subPath === '/hide') {
      const { hidden } = body;
      
      await sql`
        UPDATE playlists SET hidden = ${hidden}
        WHERE id = ${playlistId}::uuid
      `;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, hidden }) };
    }

    // PUT /playlists/:id - Update playlist
    if (event.httpMethod === 'PUT' && subPath === '') {
      const { name } = body;

      const [playlist] = await sql`
        UPDATE playlists SET name = COALESCE(${name}, name)
        WHERE id = ${playlistId}::uuid
        RETURNING id, name, position, created_at
      `;

      if (!playlist) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'Playlist not found' }) };
      }

      return { statusCode: 200, headers, body: JSON.stringify({ playlist }) };
    }

    // DELETE /playlists/:id - Delete playlist
    if (event.httpMethod === 'DELETE' && subPath === '') {
      await sql`DELETE FROM playlists WHERE id = ${playlistId}::uuid`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // POST /playlists/:id/videos - Add video
    if (event.httpMethod === 'POST' && subPath === '/videos') {
      const { title, url, videoType } = body;

      if (!url) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'url required' }) };
      }

      const [maxPos] = await sql`SELECT COALESCE(MAX(position), -1) + 1 as pos FROM videos WHERE playlist_id = ${playlistId}::uuid`;

      const [video] = await sql`
        INSERT INTO videos (playlist_id, title, url, video_type, position)
        VALUES (${playlistId}::uuid, ${title || url}, ${url}, ${videoType || 'youtube'}, ${maxPos.pos})
        RETURNING id, title, url, video_type as "videoType", position
      `;

      return { statusCode: 200, headers, body: JSON.stringify({ video }) };
    }

    // DELETE /playlists/:id/videos/:videoId - Remove video
    const videoMatch = subPath.match(/^\/videos\/([^\/]+)$/);
    if (event.httpMethod === 'DELETE' && videoMatch) {
      const videoId = videoMatch[1];
      await sql`DELETE FROM videos WHERE id = ${videoId}::uuid AND playlist_id = ${playlistId}::uuid`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /playlists/:id/videos/:videoId - Update video (rename, update notes, or toggle notes visibility)
    if (event.httpMethod === 'PUT' && videoMatch) {
      const videoId = videoMatch[1];
      const { title, notes, notesUpdatedBy, notesHidden } = body;
      
      if (title !== undefined) {
        await sql`UPDATE videos SET title = ${title} WHERE id = ${videoId}::uuid AND playlist_id = ${playlistId}::uuid`;
      }
      
      if (notes !== undefined) {
        await sql`UPDATE videos SET 
          notes = ${notes || null},
          notes_updated_by = ${notesUpdatedBy || null},
          notes_updated_at = NOW()
        WHERE id = ${videoId}::uuid AND playlist_id = ${playlistId}::uuid`;
      }
      
      if (notesHidden !== undefined) {
        await sql`UPDATE videos SET notes_hidden = ${notesHidden} WHERE id = ${videoId}::uuid AND playlist_id = ${playlistId}::uuid`;
      }
      
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /playlists/:id/reorder - Reorder videos
    if (event.httpMethod === 'PUT' && subPath === '/reorder') {
      const { videoIds } = body;

      if (!Array.isArray(videoIds)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'videoIds array required' }) };
      }

      for (let i = 0; i < videoIds.length; i++) {
        await sql`UPDATE videos SET position = ${i} WHERE id = ${videoIds[i]}::uuid AND playlist_id = ${playlistId}::uuid`;
      }

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Playlists error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
