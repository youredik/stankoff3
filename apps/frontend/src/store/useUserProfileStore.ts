import { create } from 'zustand';
import type { User } from '@/types';

interface UserProfileState {
  /** Пользователь для показа в профиль-модалке (null = закрыта) */
  profileUser: User | null;
  /** Открыть профиль пользователя */
  openProfile: (user: User) => void;
  /** Закрыть профиль-модалку */
  closeProfile: () => void;
}

export const useUserProfileStore = create<UserProfileState>((set) => ({
  profileUser: null,
  openProfile: (user) => set({ profileUser: user }),
  closeProfile: () => set({ profileUser: null }),
}));
