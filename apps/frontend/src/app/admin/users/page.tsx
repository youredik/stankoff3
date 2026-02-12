'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { UserList } from '@/components/admin/UserList';
import { useAuthStore } from '@/store/useAuthStore';
import { useCan } from '@/hooks/useCan';

function AdminUsersContent() {
  const router = useRouter();
  const { user } = useAuthStore();
  const canManageUsers = useCan('global:user:manage');

  useEffect(() => {
    if (user && !canManageUsers) {
      router.replace('/workspace');
    }
  }, [user, canManageUsers, router]);

  if (!canManageUsers) {
    return null;
  }

  return (
    <AppShell mainClassName="p-6">
      <div className="mb-4">
        <Breadcrumbs items={[
          { ...createHomeBreadcrumb(), onClick: () => router.push('/workspace') },
          { label: 'Администрирование' },
          { label: 'Пользователи' },
        ]} />
      </div>
      <UserList />
    </AppShell>
  );
}

export default function AdminUsersPage() {
  return (
    <AuthProvider>
      <AdminUsersContent />
    </AuthProvider>
  );
}
