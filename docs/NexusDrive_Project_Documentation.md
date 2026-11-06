# NexusDrive Project Documentation

## Authenticated Cloud Drive with Private Object Storage

> **Image placeholder:** Insert the project logo or title-page image here.

## 1. Executive Summary

NexusDrive is a web-based cloud-drive application built with Next.js,
TypeScript, Supabase, AWS S3, and Vercel. It allows authenticated users to
create private drives, organize files with folders, upload files directly to
private object storage, download files through temporary signed URLs, and
delete files, folders, or complete drives.

The original project idea included a real-time collaborative workspace. A
separate workspace prototype and related architectural exploration exist in
the codebase, but multi-user collaborative editing, invitations, sharing, and
presence are not part of the delivered NexusDrive drive workflow. They are
identified as future enhancements in this document.

> **Image placeholder:** Insert the deployed NexusDrive home screen here.

## 2. Problem Statement

Users need a simple and secure way to store and organize files without
requiring a dedicated storage server. The application must protect private
drive data, avoid routing large file payloads through the application server,
and provide a usable browser-based experience.

## 3. Project Objectives

- Provide authenticated access with Supabase Auth.
- Allow users to create private drive workspaces.
- Organize files through folders and nested navigation.
- Upload files directly from the browser to private AWS S3 storage.
- Store file metadata and access control in Supabase PostgreSQL.
- Generate secure, temporary download URLs.
- Allow owners to delete drives and associated stored objects.
- Provide clear upload progress, pending, success, and error states.
- Support persistent light and dark themes.
- Deploy the application using Vercel, Supabase, and AWS.

## 4. Implemented Scope

### Included

- User registration, sign-in, and sign-out.
- Private drive creation.
- Owner membership and drive-level authorization.
- Folder creation, navigation, and deletion.
- File upload for supported document, image, archive, JSON, CSV, and text
  types.
- Direct browser-to-S3 upload using presigned URLs.
- Upload finalization through an S3 object verification step.
- Temporary signed file downloads.
- File, folder, and owner-only drive deletion.
- Supabase Row Level Security policies.
- Realtime metadata refresh for drive changes.
- Persistent light and dark themes.
- Vercel production deployment.

### Not Implemented

- Multi-user drive invitations.
- Shareable drive or file links.
- Editor/viewer collaboration between multiple users.
- Google Docs-style simultaneous editing.
- Persistent cursor or presence tracking in the drive interface.
- Conflict-free replicated data types (CRDTs) or vector-clock conflict
  resolution.
- Malware scanning, file version history, and resumable multipart uploads.

## 5. Original Collaboration Concept

The project initially began as a distributed collaborative-workspace concept.
The intended design included room-specific realtime channels, optimistic
editing, presence, and conflict resolution. That concept was useful for
architecture exploration, but it should not be presented as a completed
product feature.

The current product should be described as a **private authenticated cloud
drive**. The collaboration concept remains future scope and may be implemented
later through explicit invitations, membership roles, shared editing
protocols, and a dedicated collaboration user interface.

## 6. Feasibility Study

### 6.1 Technical Feasibility

The selected services are compatible and provide the required capabilities:

- Next.js provides the web application and server route handlers.
- Supabase provides authentication, PostgreSQL, and Row Level Security.
- AWS S3 provides private, durable object storage.
- Vercel provides managed deployment for the Next.js application.

### 6.2 Operational Feasibility

Users only need a modern web browser. Administrators configure Supabase
authentication, database migrations, the private S3 bucket, IAM permissions,
S3 CORS, and Vercel environment variables.

### 6.3 Economic Feasibility

The application can be demonstrated with free or introductory tiers. Actual
quotas and costs vary by account, region, traffic, and storage usage. Billing
alerts and storage lifecycle rules should be configured before public use.

## 7. Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js App Router, React, TypeScript |
| Styling | Tailwind CSS and custom CSS |
| Authentication | Supabase Auth |
| Metadata database | Supabase PostgreSQL |
| Authorization | Supabase Row Level Security |
| File storage | Private AWS S3 bucket |
| Server APIs | Next.js Route Handlers |
| Hosting | Vercel |
| Source control | Git and GitHub |

> **Image placeholder:** Insert a technology-stack diagram here.

## 8. System Architecture

### 8.1 Browser Client

The browser displays the drive interface, requests authorized presigned URLs,
uploads file bytes directly to S3, requests signed downloads, and refreshes
drive metadata.

### 8.2 Next.js Application

The application serves the user interface and protected API routes. Server
routes validate the Supabase session and drive membership before creating S3
presigned URLs, finalizing uploads, generating downloads, or deleting drives.

### 8.3 Supabase

Supabase Auth manages users. PostgreSQL stores drives, memberships, folders,
files, and upload state. Row Level Security restricts access to authorized
members. Realtime metadata events support UI refreshes.

### 8.4 AWS S3

S3 stores file bytes in a private bucket. The bucket is not made public.
Presigned URLs provide short-lived access for upload and download operations.

> **Image placeholder:** Insert the system architecture diagram here.

## 9. Upload Workflow

1. The authenticated user selects a file.
2. The browser sends file metadata to `/api/storage/presign`.
3. The server validates the session, drive membership, file type, and size.
4. A pending metadata record and safe S3 object key are created.
5. The server returns a temporary presigned PUT URL.
6. The browser uploads the file directly to S3.
7. The browser calls `/api/storage/finalize`.
8. The server verifies the object and its size with S3.
9. The metadata status changes from `pending` to `complete`.
10. The interface displays the completed file.

This design keeps file bytes away from Vercel and reduces application-server
bandwidth and memory usage.

> **Image placeholder:** Insert the upload sequence diagram here.

## 10. Database and Authorization Design

### `drive_workspaces`

Stores drive identity, name, owner, and timestamps.

### `drive_members`

Associates authenticated users with drives and stores roles. The current
delivered workflow creates the owner membership; invitation-based sharing is
not implemented.

### `drive_items`

Stores folders and files. Important fields include `workspace_id`, `parent_id`,
`name`, `item_type`, `storage_key`, `mime_type`, `size_bytes`,
`upload_status`, `created_by`, and timestamps.

The `parent_id` relationship provides hierarchical folder navigation.

### Row Level Security

Policies ensure that users can only read or modify drive records and items for
drives where they have authorization. Complete drive deletion is restricted
to the owner.

> **Image placeholder:** Insert the database relationship diagram here.

## 11. Security Model

- Supabase Auth is required for private-drive operations.
- Row Level Security protects metadata at the database layer.
- S3 Block Public Access remains enabled.
- Files are accessed through short-lived signed URLs.
- AWS credentials are used only by server-side routes.
- Client filenames are sanitized before being used in storage keys.
- Storage keys are namespaced by user, drive, and item identifiers.
- `.env.local` and secret values are excluded from Git and documentation.

The application uses this storage-key pattern:

```text
users/{userId}/workspaces/{workspaceId}/{itemId}/{safeFileName}
```

## 12. Application Features

### Authentication

Users can register, sign in, and sign out. Private drive data is not exposed
to unauthenticated users.

### Drive and Folder Management

Users can create drives, create folders, navigate nested folders, and delete
items. Drive deletion requires owner confirmation and removes associated S3
objects before deleting the drive record.

### File Upload and Download

The default upload limit is 25 MB. Supported types include common PDFs,
images, ZIP archives, JSON, CSV, and plain-text files. Downloads use temporary
signed URLs.

### Theme System

The interface supports persistent light and dark themes with a warm
amber/terracotta/cream/espresso visual palette.

### Realtime Boundary

Realtime is used for drive metadata refresh behavior. It is not currently a
multi-user collaborative editing system. No claim of simultaneous document
editing or user presence should be made for the delivered drive feature.

> **Image placeholder:** Insert the drive browser screenshot here.

## 13. API Routes

| Route | Purpose |
|---|---|
| `/api/storage/presign` | Validates access and creates a pending item plus S3 upload URL |
| `/api/storage/finalize` | Verifies the uploaded S3 object and completes metadata |
| `/api/storage/download` | Creates an authorized temporary download URL |
| `/api/drive/delete` | Deletes an owner’s drive and associated S3 objects |

## 14. Deployment

### 14.1 Local Validation

```powershell
npm install
npm run lint
npm run build
```

### 14.2 Vercel Configuration

Required variable names:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_S3_BUCKET_NAME
```

The Supabase URL and anon key are browser configuration values. AWS
credentials must remain private server-side variables.

### 14.3 Supabase Configuration

Run the private-drive migration in the Supabase SQL Editor. Configure the
production Site URL and authentication redirect URL for the Vercel domain.

### 14.4 S3 Configuration

Keep Block Public Access enabled. Configure CORS for the local development
origin and the production Vercel origin. The server IAM identity requires only
the object permissions needed by the application, including PutObject,
GetObject, and DeleteObject.

### 14.5 Production Status

The deployed application is available at:

**https://nexus-drive-xi.vercel.app**

The reported production workflow includes authentication, drive creation,
folder navigation, file uploads, signed downloads, deletion, and theme
persistence. This URL is a deployment reference only; credentials are not
included in this document.

> **Image placeholder:** Insert the Vercel deployment or live application
> screenshot here.

## 15. Testing

| Test | Expected Result |
|---|---|
| Register user | Account is created |
| Sign in | User reaches the drive list |
| Create drive | A private drive appears |
| Create folder | Folder appears in the current drive |
| Upload supported file | File reaches S3 and becomes complete |
| Download file | Temporary signed download begins |
| Delete item | Item is removed |
| Delete drive | Owner’s drive and stored objects are removed |
| Switch theme | Theme persists after refresh |

Build checks:

```powershell
npm run lint
npm run build
```

> **Image placeholder:** Insert test-result screenshot here.

## 16. Limitations

- Uploads are limited to 25 MB.
- File sharing and invitations are not implemented.
- Multi-user collaborative editing is not implemented.
- The application has no malware scanning.
- Resumable multipart uploads are not implemented.
- File version history and trash/recovery are not implemented.
- Free-tier quotas limit large-scale public usage.
- S3 cleanup depends on valid IAM permissions.

## 17. Future Enhancements

1. Add drive invitations and membership management.
2. Add shareable file links with controlled permissions.
3. Add file search, previews, and filtering.
4. Add resumable uploads and retry support.
5. Add version history and trash/recovery.
6. Add activity history and audit logs.
7. Add malware scanning.
8. Implement a separate collaborative editor with explicit shared-document
   membership, presence, and conflict resolution.

## 18. Conclusion

NexusDrive currently demonstrates a practical authenticated cloud-drive
architecture. It separates authentication and metadata from private object
storage, uses direct-to-S3 uploads to reduce application-server load, and
protects drive records through Supabase Row Level Security.

The project began with a broader collaborative-workspace ambition, but the
implemented deliverable is the private cloud-drive workflow described here.
This distinction keeps the documentation aligned with the actual product and
provides a clear foundation for future collaboration features.

## 19. References

- Next.js Documentation
- TypeScript Documentation
- Supabase Documentation
- Supabase Auth and Row Level Security Documentation
- AWS S3 Documentation
- AWS IAM Documentation
- Vercel Documentation
- Tailwind CSS Documentation

> **Image placeholder:** Insert a repository QR code or references image here.
