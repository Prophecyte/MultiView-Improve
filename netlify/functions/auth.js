// netlify/functions/auth.js
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { OAuth2Client } from 'google-auth-library';

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

const generateToken = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let token = '';
  for (let i = 0; i < 64; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
};

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json'
};

const getPath = (event) => {
  let path = event.path || '';
  path = path.replace('/.netlify/functions/auth', '');
  path = path.replace('/api/auth', '');
  if (!path.startsWith('/')) path = '/' + path;
  if (path === '/') path = '';
  return path;
};

const getUserFromToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '');
  
  const [session] = await sql`
    SELECT u.id, u.email, u.username, u.display_name, u.avatar_url
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
  
  console.log('Auth function:', event.httpMethod, path);

  try {
    // POST /register
    if (event.httpMethod === 'POST' && path === '/register') {
      const { email, username, password, displayName } = body;

      if (!email || !password || !displayName) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email, password, and display name required' }) };
      }

      const existing = await sql`SELECT id FROM users WHERE email = ${email} OR (username IS NOT NULL AND username = ${username})`;
      if (existing.length > 0) {
        return { statusCode: 409, headers, body: JSON.stringify({ error: 'User already exists' }) };
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const [user] = await sql`
        INSERT INTO users (email, username, display_name, password_hash, auth_provider)
        VALUES (${email}, ${username || null}, ${displayName}, ${passwordHash}, 'email')
        RETURNING id, email, username, display_name, avatar_url
      `;

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await sql`INSERT INTO sessions (user_id, token, expires_at) VALUES (${user.id}, ${token}, ${expiresAt})`;
      await sql`INSERT INTO rooms (owner_id, name) VALUES (${user.id}, 'My Room')`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          token,
          user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url }
        })
      };
    }

    // POST /login
    if (event.httpMethod === 'POST' && path === '/login') {
      const { identifier, password } = body;

      if (!identifier || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email/username and password required' }) };
      }

      const [user] = await sql`
        SELECT id, email, username, display_name, avatar_url, password_hash
        FROM users WHERE email = ${identifier} OR username = ${identifier}
      `;

      if (!user || !user.password_hash) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials' }) };
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid credentials' }) };
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await sql`INSERT INTO sessions (user_id, token, expires_at) VALUES (${user.id}, ${token}, ${expiresAt})`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          token,
          user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url }
        })
      };
    }

    // POST /google
    if (event.httpMethod === 'POST' && path === '/google') {
      const { credential } = body;

      if (!credential) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Google credential required' }) };
      }

      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      if (!googleClientId) {
        console.error('GOOGLE_CLIENT_ID not set');
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Google auth not configured on server' }) };
      }

      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({ idToken: credential, audience: googleClientId });
      const payload = ticket.getPayload();
      const { sub: googleId, email, name, picture } = payload;

      let [user] = await sql`
        SELECT id, email, username, display_name, avatar_url, google_id
        FROM users WHERE google_id = ${googleId} OR email = ${email}
      `;

      if (!user) {
        [user] = await sql`
          INSERT INTO users (email, display_name, avatar_url, auth_provider, google_id)
          VALUES (${email}, ${name}, ${picture}, 'google', ${googleId})
          RETURNING id, email, username, display_name, avatar_url
        `;
        await sql`INSERT INTO rooms (owner_id, name) VALUES (${user.id}, 'My Room')`;
      } else if (!user.google_id) {
        await sql`UPDATE users SET google_id = ${googleId}, avatar_url = COALESCE(avatar_url, ${picture}) WHERE id = ${user.id}`;
      }

      const token = generateToken();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await sql`INSERT INTO sessions (user_id, token, expires_at) VALUES (${user.id}, ${token}, ${expiresAt})`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          token,
          user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url }
        })
      };
    }

    // GET /me
    if (event.httpMethod === 'GET' && (path === '/me' || path === '')) {
      const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
      
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          user: { id: user.id, email: user.email, username: user.username, displayName: user.display_name, avatarUrl: user.avatar_url }
        })
      };
    }

    // POST /logout
    if (event.httpMethod === 'POST' && path === '/logout') {
      const authHeader = event.headers.authorization || event.headers.Authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        await sql`DELETE FROM sessions WHERE token = ${token}`;
      }
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /profile - Update user profile
    if (event.httpMethod === 'PUT' && path === '/profile') {
      const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
      }

      const { displayName } = body;
      if (!displayName || !displayName.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Display name is required' }) };
      }

      // Update user's display name
      await sql`UPDATE users SET display_name = ${displayName.trim()} WHERE id = ${user.id}`;
      
      // Also update display name in all room_visitors entries for this user
      await sql`UPDATE room_visitors SET display_name = ${displayName.trim()} WHERE user_id = ${user.id}`;
      
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /email - Update user email
    if (event.httpMethod === 'PUT' && path === '/email') {
      const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
      }

      const { newEmail, password } = body;
      if (!newEmail || !password) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email and password are required' }) };
      }

      // Verify current password
      const [fullUser] = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
      const validPassword = await bcrypt.compare(password, fullUser.password_hash);
      if (!validPassword) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Incorrect password' }) };
      }

      // Check if new email is already taken
      const [existing] = await sql`SELECT id FROM users WHERE email = ${newEmail.toLowerCase()} AND id != ${user.id}`;
      if (existing) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email already in use' }) };
      }

      await sql`UPDATE users SET email = ${newEmail.toLowerCase()} WHERE id = ${user.id}`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // PUT /password - Update user password
    if (event.httpMethod === 'PUT' && path === '/password') {
      const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
      }

      const { currentPassword, newPassword } = body;
      if (!currentPassword || !newPassword) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Current and new password are required' }) };
      }

      if (newPassword.length < 6) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Password must be at least 6 characters' }) };
      }

      // Verify current password
      const [fullUser] = await sql`SELECT password_hash FROM users WHERE id = ${user.id}`;
      const validPassword = await bcrypt.compare(currentPassword, fullUser.password_hash);
      if (!validPassword) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Incorrect current password' }) };
      }

      // Hash new password and update
      const newHash = await bcrypt.hash(newPassword, 10);
      await sql`UPDATE users SET password_hash = ${newHash} WHERE id = ${user.id}`;
      
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    // DELETE /account - Delete user account
    if (event.httpMethod === 'DELETE' && path === '/account') {
      const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);
      
      if (!user) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Not authenticated' }) };
      }

      // Delete in order due to foreign key constraints:
      // 1. Delete room visitors for user's rooms
      await sql`DELETE FROM room_visitors WHERE room_id IN (SELECT id FROM rooms WHERE owner_id = ${user.id})`;
      // 2. Delete room visitors where this user is a visitor
      await sql`DELETE FROM room_visitors WHERE user_id = ${user.id}`;
      // 3. Delete videos in playlists in user's rooms
      await sql`DELETE FROM videos WHERE playlist_id IN (SELECT id FROM playlists WHERE room_id IN (SELECT id FROM rooms WHERE owner_id = ${user.id}))`;
      // 4. Delete playlists in user's rooms
      await sql`DELETE FROM playlists WHERE room_id IN (SELECT id FROM rooms WHERE owner_id = ${user.id})`;
      // 5. Delete user's rooms
      await sql`DELETE FROM rooms WHERE owner_id = ${user.id}`;
      // 6. Delete user's sessions
      await sql`DELETE FROM sessions WHERE user_id = ${user.id}`;
      // 7. Delete the user
      await sql`DELETE FROM users WHERE id = ${user.id}`;

      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    console.log('No route matched:', event.httpMethod, path);
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found', path, method: event.httpMethod }) };

  } catch (error) {
    console.error('Auth error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
