'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ThemeToggle } from '@/components/theme-provider';
import {
  ApplyEditResult,
  compareOperations,
  EditOperation,
  Workspace,
} from '@/lib/workspace-types';

const SAVE_DELAY_MS = 400;

function getClientId() {
  const key = 'realtime-collab-client-id';
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const clientId = crypto.randomUUID();
  window.localStorage.setItem(key, clientId);
  return clientId;
}

export default function WorkspaceRoom({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [operation, setOperation] = useState<EditOperation | null>(null);
  const [peerCount, setPeerCount] = useState(0);
  const [connectionState, setConnectionState] = useState('Connecting…');
  const [error, setError] = useState('');
  const clientIdRef = useRef('');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingOperationRef = useRef<EditOperation | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyRemoteOperation = useCallback((incoming: EditOperation) => {
    setOperation((current) => {
      if (current && compareOperations(incoming, current) <= 0) return current;
      return incoming;
    });
    setWorkspace((current) => {
      if (!current) return current;
      const currentOperation = {
        updatedAt: current.updated_at,
        clientId: current.updated_by,
      };
      return compareOperations(incoming, currentOperation) > 0
        ? {
            ...current,
            content: incoming.content,
            updated_at: incoming.updatedAt,
            updated_by: incoming.clientId,
          }
        : current;
    });

    const pending = pendingOperationRef.current;
    if (pending && compareOperations(incoming, pending) > 0) {
      pendingOperationRef.current = null;
    }
  }, []);

  const saveOperation = useCallback(async (nextOperation: EditOperation) => {
    const { data, error: saveError } = await supabase.rpc(
      'apply_workspace_edit',
      {
        target_workspace_id: workspaceId,
        next_content: nextOperation.content,
        next_updated_at: nextOperation.updatedAt,
        next_updated_by: nextOperation.clientId,
      },
    );

    if (saveError) {
      setError(`Could not save this edit: ${saveError.message}`);
      return false;
    }

    const result = (data as ApplyEditResult[] | null)?.[0];
    if (!result) {
      setError('The database returned an empty save response.');
      return false;
    }

    if (!result.accepted) {
      applyRemoteOperation({
        content: result.content,
        updatedAt: result.updated_at,
        clientId: result.updated_by,
      });
    }
    return true;
  }, [applyRemoteOperation, workspaceId]);

  useEffect(() => {
    clientIdRef.current = getClientId();
    let active = true;

    async function loadWorkspace() {
      const { data, error: loadError } = await supabase
        .from('workspaces')
        .select('id, title, content, updated_at, updated_by')
        .eq('id', workspaceId)
        .maybeSingle();

      if (!active) return;
      if (loadError) {
        setError(`Could not load this workspace: ${loadError.message}`);
        return;
      }
      if (!data) {
        setError('This workspace does not exist or is no longer available.');
        return;
      }

      setWorkspace(data as Workspace);
      setOperation({
        content: data.content,
        updatedAt: data.updated_at,
        clientId: data.updated_by,
      });
    }

    void loadWorkspace();

    const channel = supabase.channel(`room:${workspaceId}`, {
      config: { presence: { key: clientIdRef.current } },
    });
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'edit' }, ({ payload }) => {
        if (
          payload &&
          typeof payload.content === 'string' &&
          typeof payload.updatedAt === 'string' &&
          typeof payload.clientId === 'string'
        ) {
          applyRemoteOperation(payload as EditOperation);
        }
      })
      .on('presence', { event: 'sync' }, () => {
        setPeerCount(Object.keys(channel.presenceState()).length);
      })
      .on('presence', { event: 'join' }, () => {
        setPeerCount(Object.keys(channel.presenceState()).length);
      })
      .on('presence', { event: 'leave' }, () => {
        setPeerCount(Object.keys(channel.presenceState()).length);
      })
      .subscribe(async (status) => {
        if (!active) return;
        setConnectionState(status === 'SUBSCRIBED' ? 'Connected' : status);
        if (status === 'SUBSCRIBED') {
          const presenceResult = await channel.track({
            online_at: new Date().toISOString(),
          });
          if (presenceResult !== 'ok') {
            setError(`Presence unavailable: ${presenceResult}`);
          }
        }
      });

    return () => {
      active = false;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [applyRemoteOperation, workspaceId]);

  function handleChange(content: string) {
    if (!clientIdRef.current) return;
    const nextOperation: EditOperation = {
      content,
      updatedAt: new Date().toISOString(),
      clientId: clientIdRef.current,
    };

    pendingOperationRef.current = nextOperation;
    setOperation(nextOperation);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            content,
            updated_at: nextOperation.updatedAt,
            updated_by: nextOperation.clientId,
          }
        : current,
    );
    setError('');

    const channel = channelRef.current;
    if (channel) void channel.send({ type: 'broadcast', event: 'edit', payload: nextOperation });

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const pending = pendingOperationRef.current;
      if (pending) {
        void saveOperation(pending).then((saved) => {
          if (saved && pendingOperationRef.current === pending) {
            pendingOperationRef.current = null;
          }
        });
      }
    }, SAVE_DELAY_MS);
  }

  if (error && !workspace) {
    return (
      <main className="warm-page flex min-h-screen items-center justify-center px-6">
        <div className="warm-surface max-w-lg rounded-2xl border p-8">
          <h1 className="text-2xl font-semibold">Workspace unavailable</h1>
          <p className="mt-3 warm-muted">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="warm-accent mt-6 rounded-lg px-4 py-2 font-semibold"
          >
            Back to home
          </button>
        </div>
      </main>
    );
  }

  if (!workspace || !operation) {
    return (
      <main className="warm-page flex min-h-screen items-center justify-center warm-muted">
        Loading workspace…
      </main>
    );
  }

  return (
    <main className="warm-page min-h-screen px-4 py-6 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <button
              onClick={() => router.push('/')}
              className="warm-muted text-sm transition hover:text-[var(--accent)]"
            >
              ← All workspaces
            </button>
            <h1 className="mt-2 text-2xl font-semibold">{workspace.title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm warm-muted">
            <ThemeToggle />
            <span className="flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${connectionState === 'Connected' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              {connectionState}
            </span>
            <span>{peerCount} active {peerCount === 1 ? 'peer' : 'peers'}</span>
          </div>
        </header>

        {error && (
          <p role="alert" className="mt-5 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-3 text-sm" style={{ color: 'var(--accent-strong)' }}>
            {error}
          </p>
        )}

        <section className="mt-8">
          <label htmlFor="workspace-content" className="sr-only">
            Workspace content
          </label>
          <textarea
            id="workspace-content"
            value={operation.content}
            onChange={(event) => handleChange(event.target.value)}
            maxLength={200000}
            placeholder="Start writing together…"
            className="warm-input min-h-[65vh] w-full resize-y rounded-2xl border p-6 font-mono text-base leading-7 outline-none transition focus:ring-2 focus:ring-[var(--accent)]"
          />
          <p className="warm-muted mt-3 text-right text-xs">
            Changes save after {SAVE_DELAY_MS}ms of inactivity · {operation.content.length.toLocaleString()} characters
          </p>
        </section>
      </div>
    </main>
  );
}
