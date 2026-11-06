# NexusDrive

NexusDrive is a Next.js cloud-drive application for authenticated users. It
provides private drives, folders, direct uploads to private Amazon S3 storage,
signed downloads, and drive management through Supabase.

The repository also contains the original realtime text-workspace prototype.
It is documented separately below so the README reflects what is actually
implemented without presenting it as part of the main private-drive flow.

## Demo

https://github.com/user-attachments/assets/e9105706-e04a-451a-8866-ebcc1051dab8






## Implemented functionality

### Private drive workflow

- Email/password sign-up and sign-in with Supabase Auth.
- Authenticated users can create and list private drives.
- Drive owners can permanently delete a drive after confirmation.
- Each drive starts with a root folder named `My Drive`.
- Users can create folders and navigate through nested folders.
- Users can upload supported files up to 25 MB.
- File bytes upload directly from the browser to private S3 using a short-lived
  presigned URL.
- Uploads are finalized only after the server verifies the S3 object.
- Users can download private files through short-lived signed URLs.
- Users can delete files and folders, including child items.
- Drive item changes refresh through Supabase Realtime.
- Folder creation and uploads use optimistic UI updates.
- Light and dark themes persist in the browser.

### Realtime text-workspace prototype

The repository also includes `/workspace/[id]`, backed by
[`001_create_workspaces.sql`](./supabase/migrations/001_create_workspaces.sql):

- A text workspace can be loaded and edited by multiple connected clients.
- Edits are broadcast through a Supabase Realtime channel.
- Connected peers are shown through ephemeral presence.
- Changes are saved after 400 ms of inactivity.
- Database saves use timestamp and client ID ordering for deterministic
  last-write-wins conflict handling.
- Workspace content is limited to 200,000 characters.

This prototype is separate from the authenticated private-drive schema. The
main home page and drive routes use the private-drive migration.

## Technology

- Next.js 16 App Router
- React 19 and TypeScript
- Supabase Auth, PostgreSQL, Row Level Security, and Realtime
- Amazon S3 with AWS SDK presigned PUT and GET URLs
- Tailwind CSS 4

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create `.env.local` in the project directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=server-side-access-key
AWS_SECRET_ACCESS_KEY=server-side-secret-key
AWS_S3_BUCKET_NAME=your-private-bucket
```


### 3. Configure Supabase

Run [`002_create_private_drive.sql`](./supabase/migrations/002_create_private_drive.sql)
in the Supabase SQL Editor. It creates:

- Private drive workspaces and membership records
- Per-drive root folders and file metadata
- Row Level Security policies
- The `create_drive_workspace` database function
- Realtime support for drive item changes

Enable Email/Password authentication in Supabase Authentication. For local
testing, email confirmation can be disabled. Production deployments should
keep confirmation enabled and configure a real mail provider.

The separate text-workspace prototype requires
[`001_create_workspaces.sql`](./supabase/migrations/001_create_workspaces.sql).

### 4. Configure the S3 bucket

Create a private S3 bucket with Block Public Access enabled. The server-side
IAM identity needs:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`

Configure bucket CORS for local development and the deployed origin:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-app.vercel.app"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 300
  }
]
```

### 5. Start the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deployment

The deployed application is available at:

**https://nexus-drive-xi.vercel.app**

Add the same environment variables to the Vercel project:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
```

After deployment, verify authentication, drive creation, folder navigation,
file upload, file download, deletion, and theme switching.

## Storage and security behavior

- Supabase Auth membership checks and Row Level Security protect drive data.
- The browser uploads file bytes directly to S3; the application server does
  not proxy them.
- Presigned upload and download URLs expire after a short period.
- Generated S3 object keys prevent client filenames from controlling storage
  paths.
- Uploads are limited to 25 MB and restricted to the MIME types defined in
  [`lib/storage.ts`](./lib/storage.ts).
- Pending uploads remain visible until they are finalized or cleaned up.



## Project structure

```text
app/
  page.tsx                         Authentication and drive list
  drive/[id]/                      Private drive browser
  workspace/[id]/                  Legacy realtime text workspace
  api/storage/                     S3 presign, finalize, and download routes
  api/drive/delete/                Owner-only drive deletion route
components/                        Shared UI components
lib/                               Supabase, S3, and workspace helpers
supabase/migrations/               Database schema and security policies
```

## Useful commands

```bash
npm run dev       # Start the development server
npm run lint      # Run ESLint
npm run build     # Create a production build
npm run start     # Start the production server
```
