import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const root = path.join(process.cwd(), 'uploads');

function supabaseStorage() {
  const baseUrl = process.env.SUPABASE_URL?.replace(/\/+$/, '');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'event-media';
  if (!baseUrl || !serviceKey) return null;
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== 'https:') return null;
  } catch {
    return null;
  }
  return { baseUrl, serviceKey, bucket };
}

function fileName(file, prefix) {
  const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
  return `${prefix}-${crypto.randomUUID()}${ext}`;
}

export async function saveLocalFile(file, prefix = 'media') {
  await fs.mkdir(root, { recursive: true });
  const name = fileName(file, prefix);
  await fs.rename(file.path, path.join(root, name));
  return `/uploads/${name}`;
}

export function isObjectStorageConfigured() {
  return Boolean(supabaseStorage());
}

async function saveSupabaseFile(file, prefix) {
  const config = supabaseStorage();
  if (!config) throw new Error('MEDIA_STORAGE_NOT_CONFIGURED');
  const body = file.buffer || (file.path ? await fs.readFile(file.path) : null);
  if (!body) throw new Error('MEDIA_STORAGE_UPLOAD_FAILED');
  const name = fileName(file, prefix);
  const bucketPath = encodeURIComponent(config.bucket);
  const objectPath = encodeURIComponent(name);
  const response = await fetch(`${config.baseUrl}/storage/v1/object/${bucketPath}/${objectPath}`, {
    method: 'POST',
    headers: {
      apikey: config.serviceKey,
      Authorization: `Bearer ${config.serviceKey}`,
      'Content-Type': file.mimetype,
      'x-upsert': 'false'
    },
    body
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error('MEDIA_STORAGE_UPLOAD_FAILED');
  }
  if (file.path) await fs.rm(file.path, { force: true });
  return `${config.baseUrl}/storage/v1/object/public/${bucketPath}/${objectPath}`;
}

export async function saveMedia(file, prefix = 'media') {
  if (supabaseStorage()) return saveSupabaseFile(file, prefix);
  if (process.env.NETLIFY) throw new Error('MEDIA_STORAGE_NOT_CONFIGURED');
  return saveLocalFile(file, prefix);
}
