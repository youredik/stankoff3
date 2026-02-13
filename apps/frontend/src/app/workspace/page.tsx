'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { useWorkspaceStore } from '@/store/useWorkspaceStore';

const STORAGE_KEY = 'stankoff-selected-workspace';

function WorkspaceResolver() {
  const router = useRouter();
  const { workspaces, fetchWorkspaces } = useWorkspaceStore();

  useEffect(() => {
    const resolve = async () => {
      // Если в URL есть ?entity=, определяем workspace по entity
      const entityId = new URLSearchParams(window.location.search).get('entity');
      if (entityId) {
        try {
          const res = await fetch(`/api/entities/${entityId}`);
          if (res.ok) {
            const entity = await res.json();
            if (entity.workspaceId) {
              router.replace(`/workspace/${entity.workspaceId}?entity=${entityId}`);
              return;
            }
          }
        } catch {
          // Если не удалось найти entity — продолжаем обычную логику
        }
      }

      let ws = workspaces;
      if (ws.length === 0) {
        await fetchWorkspaces();
        ws = useWorkspaceStore.getState().workspaces;
      }
      if (ws.length === 0) return;

      const savedId = localStorage.getItem(STORAGE_KEY);
      const target = savedId && ws.some((w) => w.id === savedId) ? savedId : ws[0].id;
      router.replace(`/workspace/${target}`);
    };
    resolve();
  }, [router, workspaces, fetchWorkspaces]);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
      <div className="animate-spin h-8 w-8 border-2 border-primary-500 border-t-transparent rounded-full" />
    </div>
  );
}

export default function WorkspaceResolverPage() {
  return (
    <AuthProvider>
      <WorkspaceResolver />
    </AuthProvider>
  );
}
