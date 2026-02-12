'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
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
      router.replace('/workspace');
    }
  }, [user, canManageUsers, router]);

  if (!canManageUsers) {
    return null;
  }

  return (
    <AppShell mainClassName="p-6">
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
