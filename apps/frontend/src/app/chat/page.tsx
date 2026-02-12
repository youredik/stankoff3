'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { ChatPage } from '@/components/chat/ChatPage';

function ChatContent() {
  const router = useRouter();
  return (
    <AppShell>
      <div className="px-6 pt-4 pb-2">
        <Breadcrumbs items={[
          { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
          { label: 'Чат' },
        ]} />
      </div>
      <Suspense>
        <ChatPage />
      </Suspense>
    </AppShell>
  );
}

export default function ChatPageRoute() {
  return (
    <AuthProvider>
      <ChatContent />
    </AuthProvider>
  );
}
