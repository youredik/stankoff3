'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { invitationsApi } from '@/lib/api/invitations';

interface InvitationInfo {
  email: string;
  firstName: string | null;
  lastName: string | null;
}

type PageState = 'loading' | 'error' | 'form' | 'success';

function AcceptInviteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [state, setState] = useState<PageState>('loading');
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Form state
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Verify token on mount
  useEffect(() => {
    if (!token) {
      setErrorMessage('Ссылка приглашения не содержит токен.');
      setState('error');
      return;
    }

    let cancelled = false;

    async function verify() {
      try {
        const result = await invitationsApi.verifyToken(token!);
        if (cancelled) return;

        if (result.valid && result.invitation) {
          setInvitation(result.invitation);
          setFirstName(result.invitation.firstName || '');
          setLastName(result.invitation.lastName || '');
          setState('form');
        } else {
          setErrorMessage('Ссылка недействительна или просрочена.');
          setState('error');
        }
      } catch {
        if (cancelled) return;
        setErrorMessage('Ссылка недействительна или просрочена.');
        setState('error');
      }
    }

    verify();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const validate = useCallback((): string | null => {
    if (!firstName.trim()) {
      return 'Введите имя.';
    }
    if (!lastName.trim()) {
      return 'Введите фамилию.';
    }
    if (password.length < 6) {
      return 'Пароль должен содержать минимум 6 символов.';
    }
    if (password !== confirmPassword) {
      return 'Пароли не совпадают.';
    }
    return null;
  }, [firstName, lastName, password, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const validationError = validate();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);

    try {
      await invitationsApi.accept({
        token: token!,
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setState('success');
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      setFormError(message || 'Не удалось создать аккаунт. Попробуйте позже.');
    } finally {
      setSubmitting(false);
    }
  };

  // --- Loading ---
  if (state === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                Stankoff Portal
              </h1>
              <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Проверяем приглашение...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Error ---
  if (state === 'error') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                Stankoff Portal
              </h1>
              <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                {errorMessage}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Возможно, приглашение было отозвано или срок его действия истёк. Обратитесь к
                администратору для получения нового приглашения.
              </p>
              <a
                href="/login"
                className="inline-block w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors text-center"
              >
                На страницу входа
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Success ---
  if (state === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
            <div className="text-center">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
                Stankoff Portal
              </h1>
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                Аккаунт создан!
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Теперь вы можете войти в систему, используя свой email и пароль.
              </p>
              <a
                href="/login"
                className="inline-block w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-lg transition-colors text-center"
              >
                Войти
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Registration Form ---
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              Stankoff Portal
            </h1>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Создание аккаунта</p>
          </div>

          {formError && (
            <div className="p-3 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-800 rounded-lg mb-4">
              <p className="text-sm text-red-600 dark:text-red-400">{formError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email (readonly) */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={invitation?.email || ''}
                readOnly
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 w-full bg-gray-50 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed focus:outline-none"
              />
            </div>

            {/* First Name */}
            <div>
              <label
                htmlFor="firstName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Имя
              </label>
              <input
                id="firstName"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Введите имя"
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
              />
            </div>

            {/* Last Name */}
            <div>
              <label
                htmlFor="lastName"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Фамилия
              </label>
              <input
                id="lastName"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Введите фамилию"
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 w-full bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Минимум 6 символов"
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 w-full pr-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Подтверждение пароля
              </label>
              <div className="relative">
                <input
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Повторите пароль"
                  className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 w-full pr-10 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-teal-400 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 mt-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Создание аккаунта...
                </>
              ) : (
                'Создать аккаунт'
              )}
            </button>
          </form>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-6">
            Уже есть аккаунт?{' '}
            <a href="/login" className="text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300">
              Войти
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function AcceptInviteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-8">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-6">
              Stankoff Portal
            </h1>
            <Loader2 className="w-10 h-10 animate-spin text-teal-600 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Загрузка...</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<AcceptInviteFallback />}>
      <AcceptInviteContent />
    </Suspense>
  );
}
