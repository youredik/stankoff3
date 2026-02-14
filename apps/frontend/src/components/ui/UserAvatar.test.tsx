import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';

vi.mock('@/store/usePresenceStore', () => ({
  usePresenceStore: vi.fn(),
}));

vi.mock('@/hooks/useSignedUrl', () => ({
  useSignedUrl: vi.fn(() => null),
}));

vi.mock('lucide-react', () => ({ X: () => null }));

import { usePresenceStore } from '@/store/usePresenceStore';

const mockPresenceStore = (onlineIds: string[] = []) => {
  vi.mocked(usePresenceStore).mockImplementation((selector: any) =>
    selector({ onlineUserIds: new Set(onlineIds) }),
  );
};

describe('UserAvatar', () => {
  beforeEach(() => {
    mockPresenceStore();
  });

  describe('инициалы', () => {
    it('должен показывать оба инициала', () => {
      render(<UserAvatar firstName="Иван" lastName="Петров" />);
      expect(screen.getByText('ИП')).toBeTruthy();
    });

    it('должен показывать один инициал если нет фамилии', () => {
      render(<UserAvatar firstName="Иван" />);
      expect(screen.getByText('И')).toBeTruthy();
    });

    it('должен fallback на email если нет имени', () => {
      render(<UserAvatar email="admin@example.com" />);
      expect(screen.getByText('A')).toBeTruthy();
    });

    it('должен fallback на U если нет данных', () => {
      render(<UserAvatar />);
      expect(screen.getByText('U')).toBeTruthy();
    });

    it('должен приводить к верхнему регистру', () => {
      render(<UserAvatar firstName="иван" lastName="петров" />);
      expect(screen.getByText('ИП')).toBeTruthy();
    });
  });

  describe('размеры', () => {
    it('должен рендерить xs (w-5 h-5)', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" size="xs" />);
      const circle = container.querySelector('.w-5.h-5');
      expect(circle).toBeTruthy();
    });

    it('должен рендерить sm по умолчанию (w-6 h-6)', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" />);
      const circle = container.querySelector('.w-6.h-6');
      expect(circle).toBeTruthy();
    });

    it('должен рендерить md (w-8 h-8)', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" size="md" />);
      const circle = container.querySelector('.w-8.h-8');
      expect(circle).toBeTruthy();
    });

    it('должен рендерить lg (w-9 h-9)', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" size="lg" />);
      const circle = container.querySelector('.w-9.h-9');
      expect(circle).toBeTruthy();
    });

    it('должен рендерить xl (w-20 h-20)', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" size="xl" />);
      const circle = container.querySelector('.w-20.h-20');
      expect(circle).toBeTruthy();
    });
  });

  describe('детерминированные цвета инициалов', () => {
    it('должен назначать цвет на основе userId', () => {
      const { container: c1 } = render(<UserAvatar firstName="И" lastName="П" userId="user-1" />);
      const { container: c2 } = render(<UserAvatar firstName="И" lastName="П" userId="user-1" />);
      const { container: c3 } = render(<UserAvatar firstName="И" lastName="П" userId="user-2" />);

      const circle1 = c1.querySelector('.rounded-full')!;
      const circle2 = c2.querySelector('.rounded-full')!;
      const circle3 = c3.querySelector('.rounded-full')!;

      // Один и тот же userId → один и тот же цвет
      expect(circle1.className).toEqual(circle2.className);
      // Разный userId → может быть другой цвет (или совпадение, но хеш должен быть стабильным)
      // Не проверяем неравенство — хеш-коллизия возможна
      expect(circle3).toBeTruthy();
    });

    it('должен использовать email если нет userId', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" email="test@ex.com" />);
      const circle = container.querySelector('.rounded-full');
      expect(circle).toBeTruthy();
      // Не bg-primary-600, а один из AVATAR_COLORS
      expect(circle!.className).toMatch(/bg-(blue|emerald|violet|amber|rose|cyan|orange|indigo|teal|pink|lime|fuchsia)-/);
    });
  });

  describe('аватар изображение', () => {
    it('должен показывать img при наличии avatar', () => {
      render(<UserAvatar firstName="И" lastName="П" avatar="https://example.com/photo.jpg" />);
      const img = screen.getByRole('img');
      expect(img).toBeTruthy();
      expect(img.getAttribute('src')).toBe('https://example.com/photo.jpg');
    });

    it('должен fallback на инициалы если avatar не указан', () => {
      render(<UserAvatar firstName="И" lastName="П" />);
      expect(screen.getByText('ИП')).toBeTruthy();
    });

    it('должен fallback на инициалы если avatar null', () => {
      render(<UserAvatar firstName="И" lastName="П" avatar={null} />);
      expect(screen.getByText('ИП')).toBeTruthy();
    });
  });

  describe('skeleton placeholder при загрузке S3 URL', () => {
    it('должен показывать skeleton пока signed URL загружается', () => {
      // S3 key → useSignedUrl вернёт null (загрузка) → isLoading = true
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" avatar="attachments/123-photo.webp" />,
      );
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeTruthy();
    });

    it('не должен показывать skeleton для http URL', () => {
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" avatar="https://example.com/photo.jpg" />,
      );
      const skeleton = container.querySelector('.animate-pulse');
      expect(skeleton).toBeNull();
    });
  });

  describe('индикатор онлайн-статуса', () => {
    it('не должен показывать точку по умолчанию', () => {
      const { container } = render(<UserAvatar firstName="И" lastName="П" />);
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeNull();
    });

    it('должен показывать точку при showOnline=true', () => {
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" showOnline={true} />,
      );
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeTruthy();
    });

    it('не должен показывать точку при showOnline=false', () => {
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" showOnline={false} />,
      );
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeNull();
    });

    it('должен автоматически показывать точку для онлайн userId', () => {
      mockPresenceStore(['user-1', 'user-2']);
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" userId="user-1" />,
      );
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeTruthy();
    });

    it('не должен показывать точку для оффлайн userId', () => {
      mockPresenceStore(['user-1']);
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" userId="user-99" />,
      );
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeNull();
    });

    it('showOnline=false перекрывает userId в онлайне', () => {
      mockPresenceStore(['user-1']);
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" userId="user-1" showOnline={false} />,
      );
      const dot = container.querySelector('.bg-green-500');
      expect(dot).toBeNull();
    });
  });

  describe('кастомный className', () => {
    it('должен добавлять className к обёртке', () => {
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" className="my-custom" />,
      );
      expect(container.firstElementChild?.classList.contains('my-custom')).toBe(true);
    });
  });

  describe('lazy loading', () => {
    it('должен иметь loading="lazy" на img', () => {
      render(<UserAvatar firstName="И" lastName="П" avatar="https://example.com/photo.jpg" />);
      const img = screen.getByRole('img');
      expect(img.getAttribute('loading')).toBe('lazy');
    });
  });

  describe('clickable prop', () => {
    it('должен рендериться с clickable prop', () => {
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" avatar="https://example.com/photo.jpg" clickable={true} />,
      );
      expect(container.firstElementChild?.classList.contains('cursor-pointer')).toBe(true);
    });

    it('не должен показывать превью при clickable={false}', () => {
      const { container } = render(
        <UserAvatar firstName="И" lastName="П" avatar="https://example.com/photo.jpg" size="lg" clickable={false} />,
      );
      const avatar = container.firstElementChild!;
      fireEvent.click(avatar);
      // Fullscreen preview не должен появиться
      expect(container.querySelector('[role="dialog"]')).toBeNull();
    });
  });

  describe('fullscreen preview', () => {
    it('должен показывать role="dialog" при клике на аватар', () => {
      const { container } = render(
        <UserAvatar firstName="Иван" lastName="Петров" avatar="https://example.com/photo.jpg" size="md" clickable={true} />,
      );
      const avatar = container.firstElementChild!;
      fireEvent.click(avatar);
      const dialog = container.querySelector('[role="dialog"]');
      expect(dialog).toBeTruthy();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
    });
  });
});
