import { DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { bucketName, s3 } from '@/lib/storage';

type DeleteBody = { workspaceId?: string };

export async function DELETE(request: Request) {
  const supabase = await createSupabaseServerClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const userId = userData.user?.id;

  if (userError || !userId) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as DeleteBody | null;
  if (!body?.workspaceId) {
    return NextResponse.json({ error: 'A drive ID is required.' }, { status: 400 });
  }

  const { data: workspace, error: workspaceError } = await supabase
    .from('drive_workspaces')
    .select('id, owner_id')
    .eq('id', body.workspaceId)
    .maybeSingle();

  if (workspaceError) {
    return NextResponse.json({ error: workspaceError.message }, { status: 500 });
  }
  if (!workspace) {
    return NextResponse.json({ error: 'Drive not found.' }, { status: 404 });
  }
  if (workspace.owner_id !== userId) {
    return NextResponse.json({ error: 'Only the drive owner can delete it.' }, { status: 403 });
  }

  const { data: items, error: itemsError } = await supabase
    .from('drive_items')
    .select('storage_key')
    .eq('workspace_id', body.workspaceId)
    .not('storage_key', 'is', null);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const keys = (items ?? [])
    .map((item) => item.storage_key)
    .filter((key): key is string => Boolean(key));

  try {
    for (let index = 0; index < keys.length; index += 1000) {
      const batch = keys.slice(index, index + 1000);
      const result = await s3.send(new DeleteObjectsCommand({
        Bucket: bucketName,
        Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
      }));
      if (result.Errors?.length) {
        throw new Error(result.Errors.map((item) => item.Message ?? item.Key ?? 'Unknown S3 deletion error').join('; '));
      }
    }
  } catch (error) {
    return NextResponse.json({
      error: `Could not remove the drive's stored files: ${error instanceof Error ? error.message : 'S3 deletion failed.'}`,
    }, { status: 502 });
  }

  const { error: deleteError } = await supabase
    .from('drive_workspaces')
    .delete()
    .eq('id', body.workspaceId)
    .eq('owner_id', userId);

  if (deleteError) {
    return NextResponse.json({ error: `Files were removed, but the drive record could not be deleted: ${deleteError.message}` }, { status: 500 });
  }

  return NextResponse.json({ deleted: true });
}
