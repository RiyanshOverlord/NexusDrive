'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ThemeToggle } from '@/components/theme-provider';

type Drive = { id: string; name: string };

export default function HomePage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [drives, setDrives] = useState<Drive[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingDriveId, setDeletingDriveId] = useState<string | null>(null);

  async function loadDrives() {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setLoading(false);
      return;
    }
    setUserEmail(userData.user.email ?? '');
    const { data, error: driveError } = await supabase
      .from('drive_workspaces')
      .select('id, name')
      .order('created_at', { ascending: false });
    if (driveError) setError(driveError.message);
    setDrives(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadDrives(), 0);
    const { data } = supabase.auth.onAuthStateChange(() => void loadDrives());
    return () => {
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setMessage('');
    const result = name.trim()
      ? await supabase.auth.signUp({ email, password, options: { data: { name: name.trim() } } })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setError(result.error.message);
    } else {
      setMessage(name.trim() ? 'Check your email to confirm your account, then sign in.' : 'Signed in.');
      if (!name.trim()) await loadDrives();
    }
  }

  async function createDrive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const driveName = String(form.get('name') ?? '').trim();
    if (!driveName) return;
    const { data, error: createError } = await supabase.rpc('create_drive_workspace', {
      workspace_name: driveName,
    });
    if (createError) setError(createError.message);
    else if (data) router.push(`/drive/${data}`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setDrives([]);
    setUserEmail('');
  }

  async function deleteDrive(drive: Drive) {
    if (!window.confirm(`Delete "${drive.name}" and all of its files permanently?`)) return;
    setError('');
    setDeletingDriveId(drive.id);
    const response = await fetch('/api/drive/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: drive.id }),
    });
    const result = await response.json().catch(() => null) as { error?: string } | null;
    setDeletingDriveId(null);
    if (!response.ok) {
      setError(result?.error ?? 'Could not delete the drive.');
      return;
    }
    setDrives((current) => current.filter((item) => item.id !== drive.id));
  }

  if (loading) {
    return <main className="warm-page flex min-h-screen items-center justify-center warm-muted">Loading…</main>;
  }

  if (!userEmail) {
    return (
      <main className="warm-page min-h-screen px-6 py-16">
        <div className="mx-auto max-w-md">
          <div className="flex items-center justify-between"><p className="text-sm font-semibold uppercase tracking-[0.3em]" style={{ color: 'var(--accent)' }}>Distributed cloud drive</p><ThemeToggle /></div>
          <h1 className="mt-4 text-4xl font-semibold">Your files, without the bottleneck.</h1>
          <p className="mt-4 warm-muted">Sign in to create private drives, upload directly to S3, and collaborate on documents.</p>
          <form onSubmit={authenticate} className="warm-surface mt-8 rounded-2xl border p-6">
            <label className="block text-sm">Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="warm-input mt-2 w-full rounded-lg border px-3 py-2.5" /></label>
            <label className="mt-4 block text-sm">Password<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="warm-input mt-2 w-full rounded-lg border px-3 py-2.5" /></label>
            <label className="mt-4 block text-sm">Name only when creating an account<input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Leave blank to sign in" className="warm-input mt-2 w-full rounded-lg border px-3 py-2.5" /></label>
            <button className="warm-accent mt-6 w-full rounded-lg px-4 py-2.5 font-semibold">{name.trim() ? 'Create account' : 'Sign in'}</button>
          </form>
          {message && <p className="mt-4 text-sm text-emerald-300">{message}</p>}
          {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="warm-page min-h-screen px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><p className="text-sm" style={{ color: 'var(--accent)' }}>Distributed cloud drive</p><h1 className="mt-2 text-4xl font-semibold">Your drives</h1></div>
          <div className="flex items-center gap-3 text-sm warm-muted"><span>{userEmail}</span><ThemeToggle /><button onClick={signOut} className="theme-toggle">Sign out</button></div>
        </header>
        <form onSubmit={createDrive} className="mt-10 flex gap-3">
          <input name="name" required maxLength={120} placeholder="New drive name" className="warm-input min-w-0 flex-1 rounded-lg border px-4 py-3" />
          <button className="warm-accent rounded-lg px-5 font-semibold">Create drive</button>
        </form>
        {error && <p role="alert" className="mt-4 text-sm text-rose-300">{error}</p>}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {drives.map((drive) => <div key={drive.id} className="warm-surface rounded-xl border p-6"><button onClick={() => router.push(`/drive/${drive.id}`)} className="w-full text-left hover:text-[var(--accent)]"><span className="text-3xl">▣</span><h2 className="mt-4 text-lg font-semibold">{drive.name}</h2><p className="mt-1 warm-muted text-sm">Open drive</p></button><button type="button" disabled={deletingDriveId === drive.id} onClick={() => void deleteDrive(drive)} className="mt-5 text-sm font-medium hover:text-[var(--accent-strong)] disabled:opacity-50">{deletingDriveId === drive.id ? <span className="flex items-center gap-2"><span className="spinner" />Deleting…</span> : 'Delete drive'}</button></div>)}
          {!drives.length && <p className="warm-muted">Create your first drive to get started.</p>}
        </div>
      </div>
    </main>
  );
}
