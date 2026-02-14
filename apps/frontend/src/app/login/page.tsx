'use client';

import { useEffect, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Shield, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { authApi, DevUser } from '@/lib/api/auth';
import { UserAvatar } from '@/components/ui/UserAvatar';

const roleBadgeColors: Record<string, string> = {
  admin: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  manager: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  employee: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
};

const roleLabels: Record<string, string> = {
  admin: 'Админ',
  manager: 'Менеджер',
  employee: 'Сотрудник',
};

// Защита от бесконечного цикла редиректов на SSO
const SSO_REDIRECT_KEY = 'sso_redirect_count';
const SSO_REDIRECT_MAX = 3;
const SSO_REDIRECT_WINDOW_MS = 30_000; // 30 секунд

function checkAndIncrementSsoRedirect(): boolean {
  try {
    const stored = sessionStorage.getItem(SSO_REDIRECT_KEY);
    const now = Date.now();

    if (stored) {
      const { count, timestamp } = JSON.parse(stored);
      if (now - timestamp < SSO_REDIRECT_WINDOW_MS) {
        if (count >= SSO_REDIRECT_MAX) {
          return false; // Слишком много редиректов — блокируем
        }
        sessionStorage.setItem(SSO_REDIRECT_KEY, JSON.stringify({ count: count + 1, timestamp }));
        return true;
      }
    }

    // Новое окно или старый таймстамп — начинаем счётчик заново
    sessionStorage.setItem(SSO_REDIRECT_KEY, JSON.stringify({ count: 1, timestamp: now }));
    return true;
  } catch {
    return true; // sessionStorage недоступен — пропускаем проверку
  }
}

function resetSsoRedirectCounter() {
  try {
    sessionStorage.removeItem(SSO_REDIRECT_KEY);
  } catch {
    // ignore
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [devUsers, setDevUsers] = useState<DevUser[] | null>(null);
  const [devLoading, setDevLoading] = useState(true);
  const [devLoginLoading, setDevLoginLoading] = useState<string | null>(null);
  const [redirectLoopDetected, setRedirectLoopDetected] = useState(false);


  // Fallback: если login page получил access_token (например, через ошибочный redirect),
  // обрабатываем его здесь — так же как AuthProvider
  const accessTokenParam = searchParams.get('access_token');

  useEffect(() => {
    if (!accessTokenParam) return;

    // Очищаем URL от токена
    const url = new URL(window.location.href);
    url.searchParams.delete('access_token');
    window.history.replaceState({}, '', url.toString());

    // Сохраняем токен и загружаем профиль
    useAuthStore.setState({ accessToken: accessTokenParam, isLoading: true });

    const fetchProfile = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${accessTokenParam}` },
          credentials: 'include',
        });
        if (!response.ok) throw new Error('Failed to fetch profile');
        const user = await response.json();
        useAuthStore.setState({ user, isAuthenticated: true, isLoading: false });
        resetSsoRedirectCounter();
        router.push('/workspace');
      } catch {
        useAuthStore.setState({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
      }
    };

    fetchProfile();
  }, [accessTokenParam, router]);

  // Проверяем auth состояние: без checkAuth() isLoading навсегда true в чистом браузере
  useEffect(() => {
    if (accessTokenParam) return; // access_token обрабатывается отдельно выше
    useAuthStore.getState().checkAuth();
  }, [accessTokenParam]);

  // Проверяем dev mode при загрузке
  useEffect(() => {
    authApi.getDevUsers()
      .then((users) => {
        setDevUsers(users);
        setDevLoading(false);
      })
      .catch(() => {
        setDevUsers(null);
        setDevLoading(false);
      });
  }, []);

  // Обработка ошибок и редиректа
  useEffect(() => {
    // Если пришёл access_token — обрабатывается выше, не делаем ничего
    if (accessTokenParam) return;

    // Если dev users загружаются — ждём
    if (devLoading) return;

    // Если dev mode — не делаем автоматический redirect
    if (devUsers) return;

    // Проверяем ошибку SSO
    const ssoError = searchParams.get('error');
    const logoutSuccess = searchParams.get('logout');

    if (ssoError === 'sso_failed') {
      useAuthStore.setState({ error: 'Ошибка SSO авторизации. Попробуйте снова.' });
      resetSsoRedirectCounter();
      return;
    }

    // Если уже авторизован — на workspace
    if (isAuthenticated && !isLoading) {
      resetSsoRedirectCounter();
      router.push('/workspace');
      return;
    }

    // Если не авторизован, не загружается и нет ошибки и не после logout — автоматический редирект на SSO
    if (!isAuthenticated && !isLoading && !ssoError && !logoutSuccess) {
      // Защита от бесконечного цикла
      if (!checkAndIncrementSsoRedirect()) {
        setRedirectLoopDetected(true);
        return;
      }
      setIsRedirecting(true);
      window.location.href = authApi.getKeycloakLoginUrl();
    }
  }, [searchParams, isAuthenticated, isLoading, router, devLoading, devUsers, accessTokenParam]);

  // Redirect if already authenticated (regardless of dev mode)
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      resetSsoRedirectCounter();
      router.push('/workspace');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleLogin = () => {
    clearError();
    resetSsoRedirectCounter();
    setRedirectLoopDetected(false);
    setIsRedirecting(true);
    window.location.href = authApi.getKeycloakLoginUrl();
  };

  const handleDevLogin = async (email: string) => {
    setDevLoginLoading(email);
    clearError();
    try {
      const { accessToken } = await authApi.devLogin(email);
      useAuthStore.getState().setAccessToken(accessToken);
      await useAuthStore.getState().checkAuth();
      router.push('/workspace');
    } catch {
      useAuthStore.setState({ error: 'Ошибка входа. Попробуйте снова.' });
      setDevLoginLoading(null);
    }
  };

  // Обнаружен цикл редиректов — показываем страницу с кнопкой ручного входа
  if (redirectLoopDetected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded mb-4">
                <span className="text-3xl">🏭</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stankoff Portal</h1>
            </div>

            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded mb-6">
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Не удалось автоматически авторизоваться. Возможно, сессия SSO истекла.
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogin}
              className="w-full py-3 px-4 bg-primary-500 hover:bg-primary-400 text-white font-semibold rounded transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="w-5 h-5" />
              Войти через SSO
            </button>
          </div>
        </div>
      </div>
    );
  }

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
  if (isLoading || devLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded h-12 w-12 border-b-2 border-primary-500 mx-auto mb-4"></div>
          <p className="text-gray-500">Проверка авторизации...</p>
        </div>
      </div>
    );
  }

  // Dev Login UI
  if (devUsers) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-2xl">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-teal-500 rounded-lg mb-4">
                <span className="text-3xl">🏭</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stankoff Portal</h1>
              <div className="inline-block mt-2 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-full">
                DEV MODE
              </div>
            </div>

            {error && (
              <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg mb-4">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
              Выберите пользователя для входа
            </p>

            {/* User cards grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {devUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => handleDevLogin(user.email)}
                  disabled={devLoginLoading !== null}
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/10 transition-all text-left disabled:opacity-50 disabled:cursor-wait"
                >
                  {/* Avatar */}
                  <UserAvatar
                    firstName={user.firstName}
                    lastName={user.lastName}
                    email={user.email}
                    avatar={user.avatar}
                    userId={user.id}
                    size="lg"
                    clickable={false}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {user.firstName} {user.lastName}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold rounded ${roleBadgeColors[user.role] || 'bg-gray-100 text-gray-600'}`}>
                        {roleLabels[user.role] || user.role}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{user.email}</p>
                  </div>

                  {/* Loading indicator */}
                  {devLoginLoading === user.email && (
                    <Loader2 className="w-4 h-4 animate-spin text-teal-500 flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={handleLogin}
                className="w-full py-2 px-4 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors flex items-center justify-center gap-2"
              >
                <Shield className="w-4 h-4" />
                Или войти через Keycloak SSO
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Стандартная страница входа (SSO)
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
