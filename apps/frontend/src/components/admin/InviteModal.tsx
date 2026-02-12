'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, UserCheck } from 'lucide-react';
import {
  invitationsApi,
  type CreateInvitationData,
  type BulkInviteResult,
} from '@/lib/api/invitations';
import { usersApi } from '@/lib/api/users';

interface InviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

type TabMode = 'single' | 'bulk';

export function InviteModal({ isOpen, onClose, onSuccess }: InviteModalProps) {
  const [activeTab, setActiveTab] = useState<TabMode>('single');

  // Одиночное приглашение
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [department, setDepartment] = useState('');
  const [existingUser, setExistingUser] = useState(false);
  const [checkingUser, setCheckingUser] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Массовое приглашение
  const [bulkEmails, setBulkEmails] = useState('');
  const [bulkResult, setBulkResult] = useState<BulkInviteResult | null>(null);

  // Общее
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkExistingUser = useCallback(async (emailToCheck: string) => {
    if (!emailToCheck || !emailToCheck.includes('@')) {
      setExistingUser(false);
      setCheckingUser(false);
      return;
    }

    setCheckingUser(true);
    try {
      const users = await usersApi.getAll();
      const found = users.some(
        (u) => u.email.toLowerCase() === emailToCheck.toLowerCase(),
      );
      setExistingUser(found);
    } catch {
      setExistingUser(false);
    } finally {
      setCheckingUser(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (email) {
      debounceRef.current = setTimeout(() => {
        checkExistingUser(email);
      }, 500);
    } else {
      setExistingUser(false);
      setCheckingUser(false);
    }

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [email, checkExistingUser]);

  const resetForm = () => {
    setEmail('');
    setFirstName('');
    setLastName('');
    setDepartment('');
    setExistingUser(false);
    setCheckingUser(false);
    setBulkEmails('');
    setBulkResult(null);
    setError(null);
    setSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email обязателен');
      return;
    }

    setSubmitting(true);
    try {
      const data: CreateInvitationData = {
        email: email.trim(),
      };
      if (firstName.trim()) data.firstName = firstName.trim();
      if (lastName.trim()) data.lastName = lastName.trim();
      if (department.trim()) data.department = department.trim();

      await invitationsApi.create(data);
      onSuccess();
      handleClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Ошибка отправки приглашения';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBulkResult(null);

    const emails = bulkEmails
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && line.includes('@'));

    if (emails.length === 0) {
      setError('Введите хотя бы один валидный email');
      return;
    }

    setSubmitting(true);
    try {
      const invitations: CreateInvitationData[] = emails.map((emailItem) => ({
        email: emailItem,
      }));

      const result = await invitationsApi.bulkCreate({ invitations });
      setBulkResult(result);
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Ошибка массовой отправки приглашений';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={handleClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-full max-w-lg pointer-events-auto">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Пригласить сотрудника
            </h2>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-gray-700 px-6">
            <button
              onClick={() => {
                setActiveTab('single');
                setError(null);
                setBulkResult(null);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'single'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Одиночное
            </button>
            <button
              onClick={() => {
                setActiveTab('bulk');
                setError(null);
                setExistingUser(false);
              }}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                activeTab === 'bulk'
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Массовое
            </button>
          </div>

          {/* Content */}
          {activeTab === 'single' ? (
            <form onSubmit={handleSingleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email *
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="user@stankoff.ru"
                    required
                  />
                  {checkingUser && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                    </div>
                  )}
                </div>
                {existingUser && (
                  <div className="mt-2 flex items-start gap-2 p-2.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <UserCheck className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Пользователь уже существует, будут назначены только доступы
                    </span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Имя
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Фамилия
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Отдел
                </label>
                <input
                  type="text"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  placeholder="Например: IT-отдел"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting || !email.trim()}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {submitting
                    ? 'Отправка...'
                    : existingUser
                      ? 'Назначить доступ'
                      : 'Пригласить'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleBulkSubmit} className="p-6 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-300">
                  {error}
                </div>
              )}

              {bulkResult ? (
                /* Сводка результатов */
                <div className="space-y-3">
                  <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Результат массового приглашения
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 mt-3">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                          {bulkResult.created}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Приглашено
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                          {bulkResult.existingUsers}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Доступ назначен
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                          {bulkResult.failed}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          Ошибок
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Детали ошибок */}
                  {bulkResult.results.some((r) => !r.success) && (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Ошибки:
                      </p>
                      {bulkResult.results
                        .filter((r) => !r.success)
                        .map((r, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400"
                          >
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>
                              {r.email}: {r.error || 'Неизвестная ошибка'}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors cursor-pointer"
                    >
                      Закрыть
                    </button>
                  </div>
                </div>
              ) : (
                /* Форма ввода */
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Список email (по одному на строку)
                    </label>
                    <textarea
                      value={bulkEmails}
                      onChange={(e) => setBulkEmails(e.target.value)}
                      className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500 resize-none"
                      rows={8}
                      placeholder={
                        'ivan@stankoff.ru\npetr@stankoff.ru\nmaria@stankoff.ru'
                      }
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {
                        bulkEmails
                          .split('\n')
                          .map((l) => l.trim())
                          .filter((l) => l.length > 0 && l.includes('@'))
                          .length
                      }{' '}
                      валидных email
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors cursor-pointer"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={submitting || !bulkEmails.trim()}
                      className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? 'Отправка...' : 'Пригласить всех'}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </>
  );
}
