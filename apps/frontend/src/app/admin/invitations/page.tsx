'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { InvitationList } from '@/components/admin/InvitationList';
import { useAuthStore } from '@/store/useAuthStore';
import { useCan } from '@/hooks/useCan';

function AdminInvitationsContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManageUsers = useCan('global:user:manage');

  useEffect(() => {
    if (user && !canManageUsers) {
      router.replace('/dashboard');
    }
  }, [user, canManageUsers, router]);

  const handleWorkspaceChange = (id: string) => {
    router.push('/dashboard');
  };

  if (!canManageUsers) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar selectedWorkspace="" onWorkspaceChange={handleWorkspaceChange} />

        <main className="flex-1 p-6">
          <InvitationList />
        </main>
      </div>
    </div>
  );
}

export default function AdminInvitationsPage() {
  return (
    <AuthProvider>
      <AdminInvitationsContent />
    </AuthProvider>
  );
}
