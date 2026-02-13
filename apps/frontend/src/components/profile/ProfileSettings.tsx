'use client';

import { useState, useCallback, useRef } from 'react';
import { User as UserIcon, Palette, Bell, Shield, Check, Loader2, BellRing, Volume2, Camera, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';
import { useThemeStore, type Theme } from '@/store/useThemeStore';
import { useNotificationStore } from '@/store/useNotificationStore';
import { useBrowserNotifications } from '@/hooks/useBrowserNotifications';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { AvatarCropModal } from './AvatarCropModal';
import { authApi } from '@/lib/api/auth';
import { filesApi } from '@/lib/api/files';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const MAX_AVATAR_SIZE = 15 * 1024 * 1024; // 15 MB

export function ProfileSettings() {
  const { user } = useAuthStore();
  const { theme, setTheme } = useThemeStore();
  const { browserNotificationsEnabled, setBrowserNotificationsEnabled, soundEnabled, setSoundEnabled } = useNotificationStore();
  const { permission, isSupported, requestPermission } = useBrowserNotifications();

  const [firstName, setFirstName] = useState(user?.firstName || '');
  const [lastName, setLastName] = useState(user?.lastName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [saveError, setSaveError] = useState<string | null>(null);

  // Avatar state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    // Клиентская валидация
    if (!firstName.trim()) {
      setSaveError('Имя обязательно');
      return;
    }
    if (!lastName.trim()) {
      setSaveError('Фамилия обязательна');
      return;
    }

    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const updated = await authApi.updateProfile({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        department: department.trim() || undefined,
      });
      useAuthStore.setState({ user: { ...user!, ...updated } });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setSaveError('Не удалось сохранить');
    } finally {
      setSaving(false);
    }
  }, [firstName, lastName, department, user]);

  const handleAvatarSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input для повторного выбора того же файла
    e.target.value = '';

    // Валидация типа
    if (!file.type.startsWith('image/')) {
      setAvatarError('Выберите изображение (JPG, PNG, WebP)');
      return;
    }

    // Валидация размера
    if (file.size > MAX_AVATAR_SIZE) {
      setAvatarError('Максимальный размер — 15 МБ');
      return;
    }

    setAvatarError(null);
    // Открываем кроп-модалку вместо мгновенной загрузки
    setCropFile(file);
  }, []);

  const handleCroppedAvatar = useCallback(async (croppedFile: File) => {
    setCropFile(null);

    // Мгновенный preview
    const previewUrl = URL.createObjectURL(croppedFile);
    setAvatarPreview(previewUrl);

    try {
      setAvatarUploading(true);

      // Загрузка на S3
      const uploaded = await filesApi.upload(croppedFile);

      // Обновление профиля — сохраняем S3 key (не presigned URL, который истекает)
      const updated = await authApi.updateProfile({ avatar: uploaded.key });
      useAuthStore.setState({ user: { ...user!, ...updated } });

      // Очистка preview — теперь используем реальный URL
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } catch {
      setAvatarError('Не удалось загрузить аватар');
      URL.revokeObjectURL(previewUrl);
      setAvatarPreview(null);
    } finally {
      setAvatarUploading(false);
    }
  }, [user]);

  const handleAvatarRemove = useCallback(async () => {
    try {
      setAvatarUploading(true);
      const updated = await authApi.updateProfile({ avatar: null });
      useAuthStore.setState({ user: { ...user!, ...updated } });
      setAvatarPreview(null);
    } catch {
      setAvatarError('Не удалось удалить аватар');
    } finally {
      setAvatarUploading(false);
    }
  }, [user]);

  const handleTogglePush = async () => {
    if (!browserNotificationsEnabled) {
      if (permission !== 'granted') {
        const granted = await requestPermission();
        if (granted) setBrowserNotificationsEnabled(true);
      } else {
        setBrowserNotificationsEnabled(true);
      }
    } else {
      setBrowserNotificationsEnabled(false);
    }
  };

  const hasChanges =
    firstName.trim() !== (user?.firstName || '') ||
    lastName.trim() !== (user?.lastName || '') ||
    department.trim() !== (user?.department || '');

  const getRoleName = () => {
    switch (user?.role) {
      case 'admin': return 'Администратор';
      case 'manager': return 'Менеджер';
      case 'employee': return 'Сотрудник';
      default: return user?.role || '—';
    }
  };

  if (!user) return null;

  const displayAvatar = avatarPreview || user.avatar;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        Профиль и настройки
      </h1>

      {/* Профиль */}
      <Section icon={UserIcon} title="Профиль">
        <div className="flex items-start gap-6">
          {/* Avatar с загрузкой */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <div className="relative group">
              <UserAvatar
                firstName={user.firstName}
                lastName={user.lastName}
                email={user.email}
                avatar={displayAvatar}
                size="xl"
                clickable={false}
              />
              {/* Overlay при наведении */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarUploading}
                aria-label="Сменить аватар"
                className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-colors cursor-pointer"
              >
                {avatarUploading ? (
                  <Loader2 className="w-6 h-6 text-white animate-spin" />
                ) : (
                  <Camera className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarSelect}
                className="hidden"
              />
            </div>
            {user.avatar && !avatarUploading && (
              <button
                type="button"
                onClick={handleAvatarRemove}
                className="text-xs text-gray-400 hover:text-danger-500 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Удалить
              </button>
            )}
            {avatarError && (
              <p className="text-xs text-danger-500 text-center max-w-[120px]">{avatarError}</p>
            )}
          </div>
          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Имя">
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Имя"
                  maxLength={100}
                />
              </Field>
              <Field label="Фамилия">
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                  placeholder="Фамилия"
                  maxLength={100}
                />
              </Field>
            </div>
            <Field label="Отдел">
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="Отдел / подразделение"
                maxLength={200}
              />
            </Field>
            <Field label="Email">
              <div className="px-3 py-2 text-sm rounded-lg bg-gray-50 dark:bg-gray-800/50 text-gray-500 dark:text-gray-400 border border-gray-100 dark:border-gray-700">
                {user.email}
              </div>
            </Field>
            {saveError && (
              <p className="text-xs text-danger-500">{saveError}</p>
            )}
            {hasChanges && (
              <button
                onClick={handleSave}
                disabled={saving || !firstName.trim() || !lastName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saved ? (
                  <Check className="w-4 h-4" />
                ) : null}
                {saved ? 'Сохранено' : 'Сохранить'}
              </button>
            )}
          </div>
        </div>
      </Section>

      {/* Оформление */}
      <Section icon={Palette} title="Оформление">
        <Field label="Тема оформления">
          <div className="flex gap-2">
            {([
              { value: 'light', label: 'Светлая' },
              { value: 'dark', label: 'Тёмная' },
              { value: 'system', label: 'Системная' },
            ] as { value: Theme; label: string }[]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  theme === opt.value
                    ? 'bg-primary-500 text-white border-primary-500'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      {/* Уведомления */}
      <Section icon={Bell} title="Уведомления">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BellRing className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-900 dark:text-gray-100">Push-уведомления в браузере</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Показывать уведомления когда вкладка не активна
                </p>
              </div>
            </div>
            {isSupported ? (
              <Toggle checked={browserNotificationsEnabled && permission === 'granted'} onToggle={handleTogglePush} label="Push-уведомления" />
            ) : (
              <span className="text-xs text-gray-400">Не поддерживается</span>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Volume2 className="w-4 h-4 text-gray-400" />
              <div>
                <p className="text-sm text-gray-900 dark:text-gray-100">Звуковые уведомления</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Проигрывать звук при новых событиях
                </p>
              </div>
            </div>
            <Toggle checked={soundEnabled} onToggle={() => setSoundEnabled(!soundEnabled)} label="Звуковые уведомления" />
          </div>

          {permission === 'denied' && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
              Push-уведомления заблокированы в браузере. Разрешите их в настройках сайта (значок замка в адресной строке).
            </p>
          )}
          {browserNotificationsEnabled && permission === 'granted' && (
            <p className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 rounded-lg px-3 py-2">
              Push-уведомления включены. Вы будете получать уведомления о заявках, комментариях, SLA и других событиях.
            </p>
          )}
        </div>
      </Section>

      {/* Аккаунт */}
      <Section icon={Shield} title="Аккаунт">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <InfoRow label="Роль" value={getRoleName()} />
          <InfoRow label="Статус" value={user.isActive ? 'Активен' : 'Неактивен'} />
          <InfoRow
            label="Зарегистрирован"
            value={user.createdAt ? format(new Date(user.createdAt), 'd MMMM yyyy', { locale: ru }) : '—'}
          />
          <InfoRow label="ID" value={user.id} mono />
        </div>
      </Section>

      {/* Кроп-модалка аватара */}
      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          onCrop={handleCroppedAvatar}
          onClose={() => setCropFile(null)}
        />
      )}
    </div>
  );
}

// ─── Вспомогательные компоненты ─────────────────────────

function Section({ icon: Icon, title, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-800">
        <Icon className="w-4 h-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onToggle, label }: { checked: boolean; onToggle: () => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <span className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">{label}</span>
      <span className={`text-sm text-gray-900 dark:text-gray-100 ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
    </div>
  );
}
