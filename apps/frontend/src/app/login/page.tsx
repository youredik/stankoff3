'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { setAuthInterceptors } from '@/lib/api/client';
import { authApi } from '@/lib/api/auth';

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated, isLoading, error, clearError } =
    useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authProvider, setAuthProvider] = useState<'local' | 'keycloak'>('local');
  const [providerLoading, setProviderLoading] = useState(true);

  // Устанавливаем interceptors при монтировании
  useEffect(() => {
    setAuthInterceptors(
      () => useAuthStore.getState().accessToken,
      () => useAuthStore.getState().refreshTokens(),
    );
  }, []);

  // Загружаем информацию о провайдере авторизации
  useEffect(() => {
    const loadProvider = async () => {
      try {
        const providerInfo = await authApi.getProvider();
        setAuthProvider(providerInfo.provider);

        // Если есть ошибка SSO — показываем её
        const ssoError = searchParams.get('error');
        if (ssoError === 'sso_failed') {
          useAuthStore.setState({ error: 'Ошибка SSO авторизации. Попробуйте снова.' });
        }

        // Авто-редирект на Keycloak только если:
        // 1. Провайдер - keycloak
        // 2. Нет ошибки SSO
        // 3. Нет флага что мы уже пытались (защита от loop)
        const alreadyTried = sessionStorage.getItem('sso_redirect_attempted');
        if (providerInfo.provider === 'keycloak' && !ssoError && !alreadyTried) {
          sessionStorage.setItem('sso_redirect_attempted', 'true');
          window.location.href = authApi.getKeycloakLoginUrl();
          return;
        }
      } catch {
        // По умолчанию используем local
        setAuthProvider('local');
      } finally {
        setProviderLoading(false);
      }
    };
    loadProvider();
  }, [searchParams]);

  // Редирект если уже авторизован
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    setIsSubmitting(true);

    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      // Ошибка уже в store
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeycloakLogin = () => {
    // Редирект на backend endpoint который перенаправит на Keycloak
    window.location.href = authApi.getKeycloakLoginUrl();
  };

  if (isLoading || providerLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl p-8">
          {/* Логотип */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
              <span className="text-3xl">🏭</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stankoff Portal</h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Войдите в систему</p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg mb-6">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {/* Keycloak SSO — показываем только при ошибке */}
          {authProvider === 'keycloak' && (
            <button
              type="button"
              onClick={handleKeycloakLogin}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              Повторить вход через SSO
            </button>
          )}

          {/* Форма локального входа — только для local провайдера */}
          {authProvider === 'local' && (
            <>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="email"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@stankoff.ru"
                    required
                    autoComplete="email"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
                  >
                    Пароль
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium rounded-lg transition-colors flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                      Вход...
                    </>
                  ) : (
                    'Войти'
                  )}
                </button>
              </form>

              <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                  Тестовые учётные данные:
                  <br />
                  <span className="font-mono">admin@stankoff.ru / password</span>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function LoginPageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-950">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
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
