'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
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
      router.replace('/workspace');
    }
  }, [user, canManageRoles, router]);

  if (!canManageRoles) {
    return null;
  }

  return (
    <AppShell mainClassName="p-6">
      <RoleList />
    </AppShell>
  );
}

export default function AdminRolesPage() {
  return (
    <AuthProvider>
      <AdminRolesContent />
    </AuthProvider>
  );
}
