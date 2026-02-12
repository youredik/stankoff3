'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { KnowledgeBasePage } from '@/components/knowledge-base/KnowledgeBasePage';

function KnowledgeBaseInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || undefined;
  return <KnowledgeBasePage initialTab={initialTab} />;
}

function KnowledgeBaseContent() {
  return (
    <AppShell>
      <Suspense>
        <KnowledgeBaseInner />
      </Suspense>
    </AppShell>
  );
}

export default function KnowledgeBaseRoute() {
  return (
    <AuthProvider>
      <KnowledgeBaseContent />
    </AuthProvider>
  );
}
