'use client';

import { Suspense } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';

// Dynamic import to avoid SSR issues with dnd-kit
const WorkspaceBuilder = dynamic(
  () =>
    import('@/components/workspace/WorkspaceBuilder').then(
      (mod) => mod.WorkspaceBuilder
    ),
  { ssr: false }
);

function SettingsContent() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const workspaceId = params.id as string;
  const tab = searchParams.get('tab') || undefined;

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex flex-col overflow-hidden">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        <WorkspaceBuilder
          workspaceId={workspaceId}
          initialTab={tab}
          onBack={() => router.push(`/workspace/${workspaceId}`)}
        />
      </main>
      <ToastContainer />
    </div>
  );
}

export default function WorkspaceSettingsPage() {
  return (
    <AuthProvider>
      <Suspense>
        <SettingsContent />
      </Suspense>
    </AuthProvider>
  );
}
