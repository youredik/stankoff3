'use client';

import { useEffect, ReactNode, useState, Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/useAuthStore';
import { usePermissionStore } from '@/store/usePermissionStore';

interface AuthProviderProps {
  children: ReactNode;
}

function AuthProviderInner({ children }: AuthProviderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [ssoProcessing, setSsoProcessing] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Ждём восстановления из localStorage (Zustand persist)
  useEffect(() => {
    // Проверяем сразу, если уже hydrated
    if (useAuthStore.persist.hasHydrated()) {
      console.log('[AuthProvider] Already hydrated');
      setHydrated(true);
      return;
    }

    // Подписываемся на завершение hydration
    const unsubFinishHydration = useAuthStore.persist.onFinishHydration(() => {
      console.log('[AuthProvider] Hydration finished, token:', useAuthStore.getState().accessToken ? 'present' : 'null');
      setHydrated(true);
    });

    return () => {
      unsubFinishHydration();
    };
  }, []);

  // Обрабатываем access_token из Keycloak SSO callback (только один раз)
  const [authChecked, setAuthChecked] = useState(false);
  // Извлекаем значение один раз для стабильной зависимости
  const accessTokenParam = searchParams.get('access_token');

  useEffect(() => {
    // Ждём hydration перед проверкой авторизации
    if (!hydrated || authChecked) return;

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
          // Используем относительный путь для работы через rewrites и корректной работы cookies
          const response = await fetch('/api/auth/me', {
            headers: {
              'Authorization': `Bearer ${accessTokenParam}`,
            },
            credentials: 'include',
          });

          if (!response.ok) throw new Error('Failed to fetch profile');

          const user = await response.json();
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
    } else {
      setAuthChecked(true);
      // Если есть сохранённый токен в localStorage - проверяем его валидность
      const savedToken = useAuthStore.getState().accessToken;
      if (savedToken) {
        // Токен есть - проверяем что он ещё действителен
        checkAuth();
      } else {
        // Нет токена - не авторизован
        useAuthStore.setState({ isLoading: false, isAuthenticated: false });
      }
    }
  }, [hydrated, accessTokenParam, checkAuth, authChecked]);

  // Загружаем permissions после успешной аутентификации, сбрасываем при logout
  useEffect(() => {
    if (isAuthenticated) {
      usePermissionStore.getState().fetchPermissions();
    } else {
      usePermissionStore.getState().reset();
    }
  }, [isAuthenticated]);

  // Редирект на логин если не авторизован
  useEffect(() => {
    // Не редиректим если в URL есть access_token (обрабатывается выше)
    if (!isLoading && !ssoProcessing && !isAuthenticated && pathname !== '/login' && !accessTokenParam) {
      router.push('/login');
    }
  }, [isLoading, ssoProcessing, isAuthenticated, pathname, router, accessTokenParam]);

  // Показываем загрузку пока ждём hydration, проверяем авторизацию или обрабатываем SSO
  if (!hydrated || isLoading || ssoProcessing) {
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
