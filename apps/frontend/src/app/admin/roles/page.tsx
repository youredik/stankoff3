'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { RoleList } from '@/components/admin/RoleList';
import { useAuthStore } from '@/store/useAuthStore';
import { useCan } from '@/hooks/useCan';

function AdminRolesContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManageRoles = useCan('global:role:manage');

  useEffect(() => {
    if (user && !canManageRoles) {
      router.replace('/dashboard');
    }
  }, [user, canManageRoles, router]);

  const handleWorkspaceChange = (id: string) => {
    router.push('/dashboard');
  };

  if (!canManageRoles) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar selectedWorkspace="" onWorkspaceChange={handleWorkspaceChange} />

        <main className="flex-1 p-6">
          <RoleList />
        </main>
      </div>
    </div>
  );
}

export default function AdminRolesPage() {
  return (
    <AuthProvider>
      <AdminRolesContent />
    </AuthProvider>
  );
}
