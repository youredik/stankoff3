'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { Breadcrumbs, createHomeBreadcrumb } from '@/components/ui/Breadcrumbs';
import { InvitationList } from '@/components/admin/InvitationList';
import { useAuthStore } from '@/store/useAuthStore';
import { useCan } from '@/hooks/useCan';

function AdminInvitationsContent() {
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
          { label: 'Приглашения' },
        ]} />
      </div>
      <InvitationList />
    </AppShell>
  );
}

export default function AdminInvitationsPage() {
  return (
    <AuthProvider>
      <AdminInvitationsContent />
    </AuthProvider>
  );
}
