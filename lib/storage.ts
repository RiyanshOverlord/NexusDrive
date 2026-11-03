import { S3Client } from '@aws-sdk/client-s3';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/zip',
  'application/json',
  'text/csv',
  'text/plain',
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

const region = process.env.AWS_REGION;
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
export const bucketName = process.env.AWS_S3_BUCKET_NAME;

if (!region || !accessKeyId || !secretAccessKey || !bucketName) {
  throw new Error(
    'Missing AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, or AWS_S3_BUCKET_NAME.',
  );
}

export const s3 = new S3Client({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

export function sanitizeFileName(name: string) {
  const trimmed = name.trim().replace(/[/\\]/g, '-').replace(/[^\w.\- ()]/g, '');
  return trimmed.slice(0, 180) || 'unnamed-file';
}
