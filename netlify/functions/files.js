import { neon } from '@neondatabase/serverless';
import crypto from 'crypto';

const sql = neon(process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL);

// R2 Configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || 'ea674a4d13c3617eced8098f03fb2712';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '8669f49c22fb618b449974271dc33b58';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '1a658645df5a5caf90dbaaecdcf3722b2ca5fda3ba7a960674237f7bcf60c486';
const R2_BUCKET = process.env.R2_BUCKET || 'multiview-uploads';
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://pub-232e61b35f624308ae9a194204da38b9.r2.dev';
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS'
};

// Get user from session token
const getUserFromToken = async (authHeader) => {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const [session] = await sql`
      SELECT u.id, u.email, u.display_name
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.token = ${token} AND s.expires_at > NOW()
    `;
    return session || null;
  } catch (e) {
    return null;
  }
};

// HMAC-SHA256 signing for AWS Signature V4
function hmacSHA256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmacSHA256(Buffer.from('AWS4' + secretKey), dateStamp);
  const kRegion = hmacSHA256(kDate, region);
  const kService = hmacSHA256(kRegion, service);
  const kSigning = hmacSHA256(kService, 'aws4_request');
  return kSigning;
}

// Generate presigned URL for R2 upload
function generatePresignedUrl(bucket, key, contentType, expiresIn = 3600) {
  const region = 'auto';
  const service = 's3';
  const host = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const credential = `${R2_ACCESS_KEY_ID}/${dateStamp}/${region}/${service}/aws4_request`;

  const canonicalQueryString = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`
  ].sort().join('&');

  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';

  const canonicalRequest = [
    'PUT',
    `/${bucket}/${key}`,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    `${dateStamp}/${region}/${service}/aws4_request`,
    sha256(canonicalRequest)
  ].join('\n');

  const signingKey = getSignatureKey(R2_SECRET_ACCESS_KEY, dateStamp, region, service);
  const signature = hmacSHA256(signingKey, stringToSign).toString('hex');

  const presignedUrl = `https://${host}/${bucket}/${key}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

  return presignedUrl;
}

// Allowed file types
const ALLOWED_EXTENSIONS = {
  'mp3': 'audio', 'wav': 'audio', 'm4a': 'audio', 'ogg': 'audio',
  'flac': 'audio', 'aac': 'audio', 'webm': 'audio',
  'mp4': 'video', 'ogv': 'video', 'mov': 'video'
};

const MIME_TYPES = {
  'mp3': 'audio/mpeg', 'wav': 'audio/wav', 'm4a': 'audio/mp4',
  'ogg': 'audio/ogg', 'flac': 'audio/flac', 'aac': 'audio/aac',
  'webm': 'video/webm', 'mp4': 'video/mp4', 'ogv': 'video/ogg', 'mov': 'video/quicktime'
};

export const handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const path = event.path.replace('/.netlify/functions/files', '').replace('/api/files', '');
  const body = event.body ? JSON.parse(event.body) : {};

  try {
    // POST /files/presign - Get presigned URL for upload
    if (event.httpMethod === 'POST' && path === '/presign') {
      const { filename, roomId } = body;

      if (!filename || !roomId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'filename and roomId required' })
        };
      }

      // Get file extension
      const ext = filename.split('.').pop().toLowerCase();
      const category = ALLOWED_EXTENSIONS[ext];

      if (!category) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `File type .${ext} not allowed` })
        };
      }

      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Generate unique file key
      const fileId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      const fileKey = `${roomId}/${fileId}.${ext}`;

      // Generate presigned URL
      const uploadUrl = generatePresignedUrl(R2_BUCKET, fileKey, contentType);

      // Public URL for accessing the file after upload
      const publicUrl = `${R2_PUBLIC_URL}/${fileKey}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          uploadUrl,
          publicUrl,
          fileId,
          fileKey,
          contentType,
          category
        })
      };
    }

    // POST /files/complete - Register uploaded file in database
    if (event.httpMethod === 'POST' && path === '/complete') {
      const { fileId, fileKey, filename, publicUrl, category, size, roomId } = body;

      if (!fileId || !publicUrl || !roomId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing required fields' })
        };
      }

      const user = await getUserFromToken(event.headers.authorization || event.headers.Authorization);

      // Store file reference in database (not the file data itself)
      await sql`
        INSERT INTO uploaded_files (id, room_id, filename, content_type, category, data, size, uploaded_by)
        VALUES (${fileId}, ${roomId}::uuid, ${filename}, ${category}, ${category}, ${publicUrl}, ${size || 0}, ${user ? user.id : null})
      `;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          fileId,
          url: publicUrl,
          filename,
          category
        })
      };
    }

    // GET /files/:fileId - Get file info (redirect to R2 URL)
    const fileMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (event.httpMethod === 'GET' && fileMatch) {
      const fileId = fileMatch[1];

      const [file] = await sql`
        SELECT id, filename, content_type, data as url, category
        FROM uploaded_files
        WHERE id = ${fileId}
      `;

      if (!file) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'File not found' }) };
      }

      // Redirect to the R2 public URL
      return {
        statusCode: 302,
        headers: {
          ...headers,
          'Location': file.url
        },
        body: ''
      };
    }

    // DELETE /files/:fileId
    const deleteMatch = path.match(/^\/([a-zA-Z0-9_-]+)$/);
    if (event.httpMethod === 'DELETE' && deleteMatch) {
      await sql`DELETE FROM uploaded_files WHERE id = ${deleteMatch[1]}`;
      return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
    }

    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Not found' }) };

  } catch (error) {
    console.error('Files error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
