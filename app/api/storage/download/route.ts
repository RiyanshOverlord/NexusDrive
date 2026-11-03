import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { bucketName, s3 } from '@/lib/storage';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const body = (await request.json().catch(() => null)) as { itemId?: string } | null;
  if (!userData.user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!body?.itemId) return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });

  const { data: item } = await supabase
    .from('drive_items')
    .select('storage_key, name, mime_type, upload_status')
    .eq('id', body.itemId)
    .maybeSingle();
  if (!item || item.upload_status !== 'complete') {
    return NextResponse.json({ error: 'File is not available.' }, { status: 404 });
  }

  const downloadUrl = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: item.storage_key,
      ResponseContentDisposition: `attachment; filename="${item.name.replace(/"/g, '')}"`,
      ResponseContentType: item.mime_type ?? 'application/octet-stream',
    }),
    { expiresIn: 300 },
  );
  return NextResponse.json({ downloadUrl });
}
