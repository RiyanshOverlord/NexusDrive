import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import {
  ALLOWED_MIME_TYPES,
  bucketName,
  MAX_UPLOAD_BYTES,
  sanitizeFileName,
  s3,
} from '@/lib/storage';

type PresignBody = {
  workspaceId?: string;
  parentId?: string | null;
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
};

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const body = (await request.json().catch(() => null)) as PresignBody | null;

  const userId = userData.user?.id;
  if (!userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const sizeBytes = body?.sizeBytes;
  if (
    !body?.workspaceId ||
    !body.name ||
    !body.mimeType ||
    typeof sizeBytes !== 'number' ||
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_UPLOAD_BYTES ||
    !ALLOWED_MIME_TYPES.has(body.mimeType)
  ) {
    return NextResponse.json(
      { error: 'Invalid file metadata or file exceeds the 25 MB limit.' },
      { status: 400 },
    );
  }

  const { data: member } = await supabase
    .from('drive_members')
    .select('role')
    .eq('workspace_id', body.workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (!member || !['owner', 'editor'].includes(member.role)) {
    return NextResponse.json({ error: 'You cannot upload to this workspace.' }, { status: 403 });
  }

  if (body.parentId) {
    const { data: parent } = await supabase
      .from('drive_items')
      .select('id, item_type, workspace_id')
      .eq('id', body.parentId)
      .eq('workspace_id', body.workspaceId)
      .maybeSingle();
    if (!parent || parent.item_type !== 'folder') {
      return NextResponse.json({ error: 'Destination folder was not found.' }, { status: 400 });
    }
  }

  const itemId = crypto.randomUUID();
  const safeName = sanitizeFileName(body.name);
  const storageKey = `users/${userId}/workspaces/${body.workspaceId}/${itemId}/${safeName}`;
  const { error: insertError } = await supabase.from('drive_items').insert({
    id: itemId,
    workspace_id: body.workspaceId,
    parent_id: body.parentId ?? null,
    name: safeName,
    item_type: 'file',
    storage_key: storageKey,
    mime_type: body.mimeType,
    size_bytes: sizeBytes,
    upload_status: 'pending',
    created_by: userId,
  });
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 400 });
  }

  try {
    const uploadUrl = await getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: storageKey,
        ContentType: body.mimeType,
      }),
      { expiresIn: 300 },
    );
    return NextResponse.json({ itemId, uploadUrl, storageKey });
  } catch {
    await supabase.from('drive_items').update({ upload_status: 'failed' }).eq('id', itemId);
    return NextResponse.json({ error: 'Could not create an upload URL.' }, { status: 502 });
  }
}
