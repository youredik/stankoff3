import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserAvatar } from './UserAvatar';

vi.mock('@/store/usePresenceStore', () => ({
  usePresenceStore: vi.fn(),
}));

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
});
