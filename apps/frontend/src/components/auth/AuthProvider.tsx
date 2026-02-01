'use client';

import { useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { setAuthInterceptors } from '@/lib/api/client';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, checkAuth, accessToken, refreshTokens } =
    useAuthStore();

  // Устанавливаем interceptors при монтировании
  useEffect(() => {
    setAuthInterceptors(
      () => useAuthStore.getState().accessToken,
      () => useAuthStore.getState().refreshTokens(),
    );
  }, []);

  // Проверяем авторизацию при загрузке
  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // Редирект на логин если не авторизован
  useEffect(() => {
    if (!isLoading && !isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, pathname, router]);

  // Показываем загрузку пока проверяем авторизацию
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  // Не рендерим контент если не авторизован (редирект произойдёт автоматически)
  if (!isAuthenticated && pathname !== '/login') {
    return null;
  }

  return <>{children}</>;
}
