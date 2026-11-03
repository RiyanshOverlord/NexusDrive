'use client';

import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ThemeToggle } from '@/components/theme-provider';

type DriveItem = {
  id: string;
  workspace_id: string;
  parent_id: string | null;
  name: string;
  item_type: 'folder' | 'file' | 'document';
  mime_type: string | null;
  size_bytes: number;
  upload_status: 'pending' | 'complete' | 'failed';
};

const rootId = (items: DriveItem[]) => items.find((item) => item.parent_id === null)?.id ?? null;

export default function DriveBrowser({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<DriveItem[]>([]);
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [driveName, setDriveName] = useState('Drive');
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const loadItems = useCallback(async () => {
    const { data: drive } = await supabase.from('drive_workspaces').select('name').eq('id', workspaceId).single();
    const { data, error: loadError } = await supabase.from('drive_items').select('*').eq('workspace_id', workspaceId).order('item_type').order('name');
    if (loadError) setError(loadError.message);
    if (drive) setDriveName(drive.name);
    if (data) {
      setItems((current) => {
        const remote = data as DriveItem[];
        const pending = current.filter((item) => item.upload_status === 'pending' && !remote.some((next) => next.id === item.id));
        return [...remote, ...pending];
      });
      setCurrentFolder((folder) => folder ?? rootId(data as DriveItem[]));
    }
  }, [workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadItems(), 0);
    const channel = supabase.channel(`drive:${workspaceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drive_items', filter: `workspace_id=eq.${workspaceId}` }, () => void loadItems())
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [loadItems, workspaceId]);

  const visibleItems = useMemo(() => items.filter((item) => item.parent_id === currentFolder), [items, currentFolder]);
  const current = items.find((item) => item.id === currentFolder);

  async function createFolder() {
    const name = window.prompt('Folder name');
    if (!name?.trim() || !currentFolder) return;
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError('Your session has expired. Sign in again before creating a folder.');
      return;
    }
    const optimisticId = `optimistic-${crypto.randomUUID()}`;
    const optimisticFolder: DriveItem = {
      id: optimisticId, workspace_id: workspaceId, parent_id: currentFolder, name: name.trim(),
      item_type: 'folder', mime_type: null, size_bytes: 0, upload_status: 'complete',
    };
    setItems((current) => [...current, optimisticFolder]);
    const { data: created, error: createError } = await supabase.from('drive_items').insert({
      workspace_id: workspaceId,
      parent_id: currentFolder,
      name: name.trim(),
      item_type: 'folder',
      created_by: userData.user.id,
    });
    if (createError) {
      setItems((current) => current.filter((item) => item.id !== optimisticId));
      setError(createError.message);
    } else if (created?.[0]) {
      setItems((current) => current.map((item) => item.id === optimisticId ? created[0] as DriveItem : item));
    }
  }

  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !currentFolder) return;
    setError('');
    setBusy(true);
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      setError('Your session has expired. Sign in again before uploading a file.');
      return;
    }
    setStatus(`Preparing ${file.name}…`);
    const presignResponse = await fetch('/api/storage/presign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId, parentId: currentFolder, name: file.name, mimeType: file.type || 'application/octet-stream', sizeBytes: file.size }) });
    const presign = (await presignResponse.json()) as { itemId?: string; uploadUrl?: string; error?: string };
    if (!presignResponse.ok || !presign.itemId || !presign.uploadUrl) { setError(presign.error ?? 'Could not prepare upload.'); setStatus(''); setBusy(false); return; }
    setItems((current) => [...current, {
      id: presign.itemId!, workspace_id: workspaceId, parent_id: currentFolder, name: file.name,
      item_type: 'file', mime_type: file.type || 'application/octet-stream', size_bytes: file.size, upload_status: 'pending',
    }]);
    setStatus(`Uploading ${file.name}…`);
    const uploadResponse = await fetch(presign.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
    if (!uploadResponse.ok) {
      const details = await uploadResponse.text().catch(() => '');
      setError(`S3 rejected the upload (${uploadResponse.status}). ${details.slice(0, 180) || 'Check bucket CORS, region, and permissions.'}`);
      setItems((current) => current.filter((item) => item.id !== presign.itemId));
      setStatus(''); setBusy(false); return;
    }
    const finalizeResponse = await fetch('/api/storage/finalize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId: presign.itemId }) });
    if (!finalizeResponse.ok) { const result = await finalizeResponse.json() as { error?: string }; setError(result.error ?? 'Could not finalize upload.'); } else {
      setStatus(`${file.name} uploaded.`);
      setItems((current) => current.map((item) => item.id === presign.itemId ? { ...item, upload_status: 'complete' } : item));
    }
    setBusy(false);
    void loadItems();
  }

  async function download(itemId: string) {
    const response = await fetch('/api/storage/download', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ itemId }) });
    const result = await response.json() as { downloadUrl?: string; error?: string };
    if (!response.ok || !result.downloadUrl) { setError(result.error ?? 'Download failed.'); return; }
    window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm('Delete this item and its children?')) return;
    const previous = items;
    setItems((current) => current.filter((item) => item.id !== itemId && item.parent_id !== itemId));
    const { error: deleteError } = await supabase.from('drive_items').delete().eq('id', itemId);
    if (deleteError) { setItems(previous); setError(deleteError.message); }
  }

  return (
    <main className="warm-page min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div><button onClick={() => router.push('/')} className="warm-muted text-sm hover:text-[var(--accent)]">← Your drives</button><h1 className="mt-2 text-2xl font-semibold">{driveName}</h1></div>
          <div className="flex gap-2"><ThemeToggle /><button onClick={createFolder} className="theme-toggle">New folder</button><button disabled={busy} onClick={() => inputRef.current?.click()} className="warm-accent rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60">{busy ? <span className="flex items-center gap-2"><span className="spinner" />Uploading…</span> : 'Upload file'}</button><input ref={inputRef} type="file" className="hidden" onChange={uploadFile} /></div>
        </header>
        <div className="mt-6 flex items-center gap-2 text-sm warm-muted"><button onClick={() => setCurrentFolder(rootId(items))} className="hover:text-[var(--accent)]">{driveName}</button>{current && current.id !== rootId(items) && <><span>/</span><span>{current.name}</span></>}</div>
        {status && <p className="mt-4 text-sm" style={{ color: 'var(--accent)' }}>{status}</p>}
        {error && <p role="alert" className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm" style={{ color: 'var(--accent-strong)' }}>{error}</p>}
        <section className="warm-surface mt-6 overflow-hidden rounded-xl border">
          {visibleItems.length === 0 ? <p className="warm-muted p-8">This folder is empty.</p> : visibleItems.map((item) => <div key={item.id} className="flex items-center gap-4 border-b border-[var(--border)] px-5 py-4 last:border-0"><span className="text-xl">{item.item_type === 'folder' ? '▰' : '▱'}</span><button className="min-w-0 flex-1 truncate text-left hover:text-[var(--accent)]" onClick={() => item.item_type === 'folder' ? setCurrentFolder(item.id) : download(item.id)}>{item.name}</button><span className="warm-muted flex items-center gap-1 text-xs">{item.upload_status === 'pending' ? <><span className="spinner" />Uploading…</> : item.item_type === 'folder' ? 'Folder' : `${Math.ceil(item.size_bytes / 1024)} KB`}</span><button onClick={() => deleteItem(item.id)} className="warm-muted text-xs hover:text-[var(--accent-strong)]">Delete</button></div>)}
        </section>
      </div>
    </main>
  );
}
