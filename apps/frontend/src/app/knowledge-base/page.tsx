'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { KnowledgeBasePage } from '@/components/knowledge-base/KnowledgeBasePage';

function KnowledgeBaseInner() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || undefined;
  return <KnowledgeBasePage initialTab={initialTab} />;
}

function KnowledgeBaseContent() {
  const router = useRouter();
  return (
    <AppShell>
      <div className="px-6 pt-4 pb-2">
        <Breadcrumbs items={[
          { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
          { label: 'База знаний' },
        ]} />
      </div>
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
