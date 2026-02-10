'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ChatPage } from '@/components/chat/ChatPage';

const STORAGE_KEY = 'stankoff-selected-workspace';

function ChatContent() {
  const router = useRouter();

  const handleWorkspaceChange = (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar
          selectedWorkspace=""
          onWorkspaceChange={handleWorkspaceChange}
        />

        <main className="flex-1">
          <Suspense>
            <ChatPage />
          </Suspense>
        </main>
      </div>
    </div>
  );
}

export default function ChatPageRoute() {
  return (
    <AuthProvider>
      <ChatContent />
    </AuthProvider>
  );
}
