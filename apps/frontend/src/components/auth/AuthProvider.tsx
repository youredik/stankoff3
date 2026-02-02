'use client';

import { useEffect, ReactNode, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { setAuthInterceptors } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';

interface AuthProviderProps {
  children: ReactNode;
}

function AuthProviderInner({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, checkAuth, setAccessToken } =
    useAuthStore();
  const [ssoProcessing, setSsoProcessing] = useState(false);

  // Устанавливаем interceptors при монтировании
  useEffect(() => {
    setAuthInterceptors(
      () => useAuthStore.getState().accessToken,
      () => useAuthStore.getState().refreshTokens(),
    );
  }, []);

  // Обрабатываем access_token из Keycloak SSO callback
  useEffect(() => {
    const accessTokenParam = searchParams.get('access_token');
    if (accessTokenParam) {
      setSsoProcessing(true);
      // Сохраняем токен и загружаем профиль
      setAccessToken(accessTokenParam);

      // Очищаем URL от токена
      const url = new URL(window.location.href);
      url.searchParams.delete('access_token');
      window.history.replaceState({}, '', url.toString());

      // Загружаем профиль пользователя
      authApi.me().then((user) => {
        useAuthStore.setState({
          user,
          isAuthenticated: true,
          isLoading: false,
        });
        setSsoProcessing(false);
      }).catch(() => {
        // Если не удалось загрузить профиль, пробуем checkAuth
        checkAuth().finally(() => setSsoProcessing(false));
      });
    } else {
      // Стандартная проверка авторизации
      checkAuth();
    }
  }, [searchParams, setAccessToken, checkAuth]);

  // Редирект на логин если не авторизован
  useEffect(() => {
    if (!isLoading && !ssoProcessing && !isAuthenticated && pathname !== '/login') {
      router.push('/login');
    }
  }, [isLoading, ssoProcessing, isAuthenticated, pathname, router]);

  // Показываем загрузку пока проверяем авторизацию или обрабатываем SSO
  if (isLoading || ssoProcessing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">{ssoProcessing ? 'Авторизация через SSO...' : 'Загрузка...'}</p>
        </div>
      </div>
    );
  }

  // Не рендерим контент если не авторизован (редирект произойдёт автоматически)
  if (!isAuthenticated && !ssoProcessing && pathname !== '/login') {
    return null;
  }

  return <>{children}</>;
}

function AuthProviderFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-500">Загрузка...</p>
      </div>
    </div>
  );
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <Suspense fallback={<AuthProviderFallback />}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </Suspense>
  );
}
