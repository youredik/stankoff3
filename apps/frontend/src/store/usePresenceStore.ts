import { create } from 'zustand';

interface PresenceState {
  onlineUserIds: Set<string>;
  setOnlineUsers: (ids: string[]) => void;
  addOnline: (userId: string) => void;
  removeOnline: (userId: string) => void;
  isOnline: (userId: string) => boolean;
}

export const usePresenceStore = create<PresenceState>((set, get) => ({
  onlineUserIds: new Set<string>(),

  setOnlineUsers: (ids) => set({ onlineUserIds: new Set(ids) }),

  addOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUserIds);
      next.add(userId);
      return { onlineUserIds: next };
    }),

  removeOnline: (userId) =>
    set((state) => {
      const next = new Set(state.onlineUserIds);
      next.delete(userId);
      return { onlineUserIds: next };
    }),

  isOnline: (userId) => get().onlineUserIds.has(userId),
}));
