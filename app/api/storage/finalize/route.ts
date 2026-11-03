import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { bucketName, s3 } from '@/lib/storage';

export async function POST(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData } = await supabase.auth.getUser();
  const body = (await request.json().catch(() => null)) as { itemId?: string } | null;
  if (!userData.user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  if (!body?.itemId) {
    return NextResponse.json({ error: 'Item ID is required.' }, { status: 400 });
  }

  const { data: item, error: itemError } = await supabase
    .from('drive_items')
    .select('id, storage_key, size_bytes, upload_status')
    .eq('id', body.itemId)
    .eq('created_by', userData.user.id)
    .maybeSingle();
  if (itemError || !item) {
    return NextResponse.json({ error: 'Upload item was not found.' }, { status: 404 });
  }
  if (item.upload_status === 'complete') return NextResponse.json({ item });

  try {
    const object = await s3.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: item.storage_key }),
    );
    if (object.ContentLength !== item.size_bytes) {
      return NextResponse.json({ error: 'Uploaded file size does not match.' }, { status: 400 });
    }
  } catch {
    await supabase.from('drive_items').update({ upload_status: 'failed' }).eq('id', item.id);
    return NextResponse.json({ error: 'Uploaded object was not found in storage.' }, { status: 400 });
  }

  const { data: updated, error: updateError } = await supabase
    .from('drive_items')
    .update({ upload_status: 'complete' })
    .eq('id', item.id)
    .select()
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ item: updated });
}
