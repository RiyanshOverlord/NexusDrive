# NexusDrive

NexusDrive is a private cloud-drive application built with Next.js,
Supabase, and private Amazon S3 storage. Authenticated users can create
isolated drives, organize files into folders, upload files directly to S3,
download them through short-lived signed URLs, and manage drive contents.

## Demo

The repository includes [`NexusDrive.mp4`](./NexusDrive.mp4), a local copy of
the application walkthrough.

To display the demo as GitHub's compact playable video box, follow the
instructions in [Adding the video to GitHub](#adding-the-video-to-github).

<!-- Replace the placeholder below with the GitHub user-attachment URL after
     uploading NexusDrive.mp4 to a GitHub issue, discussion, or pull request. -->

`PASTE_GITHUB_VIDEO_ATTACHMENT_URL_HERE`

## Implemented features

- Email/password sign-up and sign-in with Supabase Auth.
- Private drives created for the authenticated owner.
- Drive listing and owner-only drive deletion.
- Folder creation and folder navigation.
- Direct browser-to-S3 file uploads using presigned URLs.
- Upload validation for supported file types and files up to 25 MB.
- Upload finalization after the server verifies the S3 object.
- Signed downloads for private files.
- File and folder deletion, including child items.
- Supabase Realtime refreshes for drive metadata changes.
- Persistent light and dark themes.
- Optimistic UI updates for folder creation and file uploads.

The delivered application is a private drive workflow. Multi-user editing,
invitations, sharing links, presence, and collaborative document editing are
not implemented.

## Technology

- Next.js 16 with the App Router
- React 19 and TypeScript
- Supabase Auth, PostgreSQL, Row Level Security, and Realtime
- Amazon S3 with AWS SDK presigned PUT and GET URLs
- Tailwind CSS

## Local setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Create a `.env.local` file in the project directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=server-side-access-key
AWS_SECRET_ACCESS_KEY=server-side-secret-key
AWS_S3_BUCKET_NAME=your-private-bucket
```

The `NEXT_PUBLIC_*` Supabase values are intended for browser use. AWS
credentials must remain server-side and must never be exposed through
`NEXT_PUBLIC_*` variables or committed to the repository.

### 3. Configure Supabase

Run [`002_create_private_drive.sql`](./supabase/migrations/002_create_private_drive.sql)
in the Supabase SQL Editor. The migration creates:

- Private drive workspaces
- Drive membership records
- Per-drive root folders and file metadata
- Row Level Security policies
- The `create_drive_workspace` database function
- Realtime support for drive item changes

Enable Email/Password authentication in Supabase Authentication. For local
testing, email confirmation may be disabled. Production deployments should
keep confirmation enabled and configure a real mail provider.

### 4. Configure the S3 bucket

Create a private S3 bucket with Block Public Access enabled. The server-side
IAM identity needs only the following permissions for this bucket:

- `s3:PutObject`
- `s3:GetObject`
- `s3:DeleteObject`

Configure bucket CORS for local development and your deployed origin:

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

## Production deployment

The application is deployed on Vercel:

**Production URL:** https://nexus-drive-xi.vercel.app

Add these variables to the Vercel project:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
```

After deployment, verify sign-in, drive creation, folder creation, uploads,
downloads, deletion, and theme switching.

## Storage and security behavior

- Drive records are protected by Supabase Auth membership checks and Row
  Level Security.
- File bytes are uploaded directly from the browser to S3; the application
  server does not proxy the file contents.
- Presigned upload and download URLs are short-lived.
- Generated S3 object keys prevent client filenames from controlling storage
  paths.
- Uploads are limited to 25 MB.
- Supported upload types include PDF, ZIP, JSON, CSV, plain text, GIF, JPEG,
  PNG, and WebP files.
- Pending uploads remain visible until they are finalized or cleaned up.

Configure AWS billing alerts and lifecycle cleanup before sharing a
deployment. Free-tier limits vary by AWS account and region.

## Adding the video to GitHub

The committed MP4 is useful as a repository file, but GitHub does not usually
render a committed MP4 path as the small inline video player shown in issues
and README previews. Use a GitHub user attachment instead:

1. Open a new issue, discussion, or pull request in the repository.
2. Start writing a comment.
3. Drag [`NexusDrive.mp4`](./NexusDrive.mp4) into the comment box, or use the
   attachment control.
4. Wait for GitHub to finish uploading the video.
5. Copy the generated URL. It normally resembles:

   ```text
   https://github.com/user-attachments/assets/<video-id>
   ```

6. Edit this README and replace
   `PASTE_GITHUB_VIDEO_ATTACHMENT_URL_HERE` with the full generated URL on
   its own line.
7. Commit and push the README.
8. Open the README on GitHub. GitHub should render the attachment URL as a
   compact playable video box.

Keep [`NexusDrive.mp4`](./NexusDrive.mp4) in the repository as a downloadable
copy even after adding the GitHub attachment URL.

## Project structure

```text
app/
  page.tsx                         Authentication and drive list
  drive/[id]/                      Drive browser and file operations
  api/storage/                     S3 presign, finalize, and download routes
  api/drive/delete/                Owner-only drive deletion route
components/                        Shared UI components
lib/                               Supabase and S3 helpers
supabase/migrations/               Database schema and security policies
```

## Useful commands

```bash
npm run dev       # Start the development server
npm run lint      # Run ESLint
npm run build     # Create a production build
npm run start     # Start the production server
```

## Security notes

Never commit `.env.local`, AWS access keys, Supabase tokens, or other
credentials. Keep the S3 bucket private and use signed URLs for file access.
