'use client';

import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Header } from '@/components/layout/Header';

// Dynamic import to avoid SSR issues with dnd-kit
const WorkspaceBuilder = dynamic(
  () =>
    import('@/components/workspace/WorkspaceBuilder').then(
      (mod) => mod.WorkspaceBuilder
    ),
  { ssr: false }
);

export default function WorkspaceSettingsPage() {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.id as string;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      <main className="flex-1 flex flex-col overflow-hidden">
        <WorkspaceBuilder
          workspaceId={workspaceId}
          onBack={() => router.push('/dashboard')}
        />
      </main>
    </div>
  );
}
