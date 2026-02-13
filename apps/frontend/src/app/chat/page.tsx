'use client';

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ChatPage } from '@/components/chat/ChatPage';

function ChatContent() {
  return (
    <AppShell mainClassName="!overflow-y-hidden flex flex-col">
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
