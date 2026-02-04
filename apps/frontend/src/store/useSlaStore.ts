import { create } from 'zustand';

export interface SlaUpdate {
  targetId: string;
  targetType: string;
  instanceId: string;
  responseRemainingMinutes: number | null;
  resolutionRemainingMinutes: number | null;
  responseUsedPercent: number | null;
  resolutionUsedPercent: number | null;
  isPaused: boolean;
}

interface SlaStore {
  // Map of targetId -> SlaUpdate for quick access
  updates: Map<string, SlaUpdate>;
  lastUpdateTime: number;

  // Actions
  setUpdates: (workspaceId: string, updates: SlaUpdate[]) => void;
  getUpdate: (targetId: string) => SlaUpdate | undefined;
  clearUpdates: () => void;
}

export const useSlaStore = create<SlaStore>((set, get) => ({
  updates: new Map(),
  lastUpdateTime: 0,

  setUpdates: (workspaceId: string, updates: SlaUpdate[]) => {
    set((state) => {
      const newUpdates = new Map(state.updates);
      for (const update of updates) {
        newUpdates.set(update.targetId, update);
      }
      return { updates: newUpdates, lastUpdateTime: Date.now() };
    });
  },

  getUpdate: (targetId: string) => {
    return get().updates.get(targetId);
  },

  clearUpdates: () => {
    set({ updates: new Map(), lastUpdateTime: 0 });
  },
}));
