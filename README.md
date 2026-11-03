# Distributed Cloud Drive

This is an authenticated cloud drive and collaborative workspace built with
Next.js, Supabase Auth/PostgreSQL/Realtime, and private AWS S3 objects.

## Local setup

1. Install dependencies with `npm install`.
2. Create `.env.local` with browser-safe Supabase values and server-only AWS
   values:

   ```text
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   AWS_REGION=us-east-1
   AWS_ACCESS_KEY_ID=server-side-access-key
   AWS_SECRET_ACCESS_KEY=server-side-secret-key
   AWS_S3_BUCKET_NAME=your-private-bucket
   ```

3. Run [`supabase/migrations/001_create_workspaces.sql`](./supabase/migrations/001_create_workspaces.sql)
   if you need the original public text-workspace demo.
4. Run [`supabase/migrations/002_create_private_drive.sql`](./supabase/migrations/002_create_private_drive.sql)
   in the Supabase SQL editor. This creates private drive workspaces,
   membership-based RLS, per-drive roots, upload metadata, and Realtime
   publication. If the earlier public demo `drive_items` table exists, the
   migration preserves it as `drive_items_legacy` before creating the private
   schema.
5. Enable Email/Password in Supabase Authentication. For local demos, you can
   disable email confirmation; production should keep confirmation enabled and
   configure a real mail provider.
6. Start the app with `npm run dev`.

## AWS S3 setup

Create a private bucket with Block Public Access enabled. The IAM identity used
by the server needs only `s3:PutObject`, `s3:GetObject`, and
`s3:DeleteObject` for this bucket. `HEAD` requests are covered by
`s3:GetObject`. Do not put the AWS secret in a
`NEXT_PUBLIC_*` variable or browser code.

Add a bucket CORS rule allowing the local and deployed origins:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.vercel.app"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

The app uses short-lived presigned PUT/GET URLs. Uploads are limited to 25 MB
and an allowlist of common document/image/archive MIME types. Generated object
keys prevent client filenames from controlling storage paths.

## Drive and collaboration model

- Each drive uses an isolated Realtime channel named `drive:{workspace_id}` for
  metadata updates. File bytes go directly from the browser to S3; Vercel
  never proxies them.
- An upload is `pending` until the finalize route verifies the object with S3,
  then becomes `complete`. Failed uploads remain visible for cleanup/retry.
- Drive owners can delete a drive from the home page after confirmation. The
  server removes its private S3 objects first, then deletes the drive; apply
  the migration again if the existing database was initialized before the
  owner-delete policy was added.
- The existing text workspace uses `room:{workspace_id}`. Local edits render
  immediately and are broadcast to peers.
- A 400 ms debounce buffers PostgreSQL writes.
- Operations are ordered by `(updated_at, updated_by)`. The timestamp is an
  ISO-8601 UTC value and `updated_by` is a stable browser client ID used as a
  deterministic tie-breaker. This is LWW ordering, not a full vector clock or
  CRDT.
- Presence is ephemeral and scoped to the room channel; it is not persisted.

## Security and free-tier limits

Drive rows are private to Supabase Auth members. Share links alone are not
authorization. The original `workspaces` table remains a public demo surface
for backwards compatibility; do not use it for private data.

Document content is limited to 200,000 characters and uploads to 25 MB.
Debounced snapshots reduce database write volume, while Realtime broadcast and
S3 direct upload keep transient/high-volume traffic away from Vercel.
Configure AWS billing alerts and lifecycle cleanup before sharing a deployment:
free-tier eligibility and limits vary by account and region.

## Drive migration verification

After running migration `002`, execute this in the Supabase SQL editor:

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in ('drive_workspaces', 'drive_members', 'drive_items')
order by table_name, ordinal_position;

select policyname, tablename
from pg_policies
where schemaname = 'public'
  and tablename in ('drive_workspaces', 'drive_members', 'drive_items')
order by tablename, policyname;

select to_regclass('public.drive_items') as drive_items,
       to_regclass('public.drive_items_legacy') as legacy_drive_items,
       to_regprocedure('public.create_drive_workspace(text)') as create_drive_workspace;
```

The REST endpoint
`/rest/v1/drive_items?select=id,workspace_id&limit=0` should return HTTP 200
after the migration. A 400 response means the old incompatible table is still
being used.
