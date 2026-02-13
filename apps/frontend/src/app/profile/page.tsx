'use client';

import { Suspense } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { ProfileSettings } from '@/components/profile/ProfileSettings';

function ProfileContent() {
  return (
    <AppShell>
      <div className="max-w-2xl mx-auto px-6 py-8">
        <Suspense>
          <ProfileSettings />
        </Suspense>
      </div>
    </AppShell>
  );
}

export default function ProfilePage() {
  return (
    <AuthProvider>
      <ProfileContent />
    </AuthProvider>
  );
}
