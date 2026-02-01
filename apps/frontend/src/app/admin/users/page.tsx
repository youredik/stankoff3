'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { Sidebar } from '@/components/layout/Sidebar';
import { ToastContainer } from '@/components/ui/ToastContainer';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { UserList } from '@/components/admin/UserList';
import { useAuthStore } from '@/store/useAuthStore';

function AdminUsersContent() {
  const router = useRouter();
  const { user } = useAuthStore();

  // Проверка прав администратора
  useEffect(() => {
    if (user && user.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [user, router]);

  // Пустое рабочее место - страница не связана с workspace
  const handleWorkspaceChange = (id: string) => {
    router.push('/dashboard');
  };

  if (user?.role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ToastContainer />
      <Header />

      <div className="flex">
        <Sidebar selectedWorkspace="" onWorkspaceChange={handleWorkspaceChange} />

        <main className="flex-1 p-6">
          <UserList />
        </main>
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AuthProvider>
      <AdminUsersContent />
    </AuthProvider>
  );
}
