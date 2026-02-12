'use client';

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { KnowledgeBasePage } from '@/components/knowledge-base/KnowledgeBasePage';

function KnowledgeBaseContent() {
  return (
    <AppShell>
      <Suspense>
        <KnowledgeBasePage />
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
