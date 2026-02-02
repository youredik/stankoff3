'use client';

import { useEffect, ReactNode, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { setAuthInterceptors } from '@/lib/api/client';

interface AuthProviderProps {
  children: ReactNode;
}

function AuthProviderInner({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [ssoProcessing, setSsoProcessing] = useState(false);

  // Устанавливаем interceptors при монтировании
  useEffect(() => {
    setAuthInterceptors(
      () => useAuthStore.getState().accessToken,
      () => useAuthStore.getState().refreshTokens(),
    );
  }, []);

  // Обрабатываем access_token из Keycloak SSO callback (только один раз)
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    if (authChecked) return;

    const accessTokenParam = searchParams.get('access_token');
    if (accessTokenParam) {
      setSsoProcessing(true);
      setAuthChecked(true);

      // Очищаем URL от токена сразу
      const url = new URL(window.location.href);
      url.searchParams.delete('access_token');
      window.history.replaceState({}, '', url.toString());

      // Сохраняем токен в store и сразу загружаем профиль с этим токеном
      useAuthStore.setState({ accessToken: accessTokenParam, isLoading: true });

      // Делаем запрос с явно переданным токеном
      const fetchProfile = async () => {
        try {
          // Создаём запрос с токеном напрямую
          const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${accessTokenParam}`,
            },
            credentials: 'include',
          });

          if (!response.ok) throw new Error('Failed to fetch profile');

          const user = await response.json();
          // Очищаем флаг SSO redirect при успешной авторизации
          sessionStorage.removeItem('sso_redirect_attempted');
          useAuthStore.setState({
            user,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch {
          // Токен невалидный - редиректим на логин
          useAuthStore.setState({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            isLoading: false,
          });
        } finally {
          setSsoProcessing(false);
        }
      };

      fetchProfile();
    } else if (!authChecked) {
      setAuthChecked(true);
      // Стандартная проверка авторизации
      checkAuth();
    }
  }, [searchParams, checkAuth, authChecked]);

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
