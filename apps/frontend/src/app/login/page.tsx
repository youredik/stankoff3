'use client';

import { useEffect, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { setAuthInterceptors } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Устанавливаем interceptors при монтировании
  useEffect(() => {
    setAuthInterceptors(
      () => useAuthStore.getState().accessToken,
      () => useAuthStore.getState().refreshTokens(),
    );
  }, []);

  // Обработка ошибок и редиректа
  useEffect(() => {
    // Проверяем ошибку SSO
    const ssoError = searchParams.get('error');
    if (ssoError === 'sso_failed') {
      useAuthStore.setState({ error: 'Ошибка SSO авторизации. Попробуйте снова.' });
      return;
    }

    // Если уже авторизован - на dashboard
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
      return;
    }

    // Если не авторизован, не загружается и нет ошибки - автоматический редирект на SSO
    if (!isAuthenticated && !isLoading && !ssoError) {
      setIsRedirecting(true);
      window.location.href = authApi.getKeycloakLoginUrl();
    }
  }, [searchParams, isAuthenticated, isLoading, router]);

  const handleLogin = () => {
    clearError();
    setIsRedirecting(true);
    window.location.href = authApi.getKeycloakLoginUrl();
  };

  // Показываем loading при редиректе
  if (isRedirecting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Перенаправление на SSO...</p>
        </div>
      </div>
    );
  }

  // Показываем loading пока проверяется авторизация
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  // Показываем страницу входа
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-8">
          {/* Логотип */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded mb-4">
              <span className="text-3xl">🏭</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stankoff Portal</h1>
            <p className="text-gray-500 mt-2">Корпоративный портал</p>
          </div>

          {error && (
            <div className="p-4 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded mb-6">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleLogin}
            className="w-full py-3 px-4 bg-primary-500 hover:bg-primary-400 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2"
          >
            <Shield className="w-5 h-5" />
            Войти через SSO
          </button>

          <p className="text-xs text-gray-500 text-center mt-6">
            Авторизация осуществляется через корпоративный SSO (Keycloak)
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="animate-spin rounded h-12 w-12 border-b-2 border-primary-500"></div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
