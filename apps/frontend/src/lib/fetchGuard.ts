/**
 * Дедупликация и rate-limiting для async-функций в Zustand stores.
 *
 * Проблема: компоненты могут монтироваться/перемонтироваться десятки раз
 * (AuthProvider cycle, router.replace, Sidebar remount), каждый раз вызывая
 * fetchWorkspaces(), fetchSections() и т.д. Без защиты это создаёт 60+ запросов
 * за секунды и убивает nginx rate limit (503).
 *
 * Решение: каждый guarded fetch гарантирует:
 * 1. Concurrent dedup — параллельные вызовы разделяют один Promise
 * 2. Cooldown — повторный вызов в пределах cooldownMs игнорируется
 * 3. Force — явный force=true обходит cooldown (для кнопки "Обновить")
 */

interface FetchGuardState {
  pending: Promise<void> | null;
  lastDoneAt: number;
}

const guards = new Map<string, FetchGuardState>();

/**
 * Обёртка для async-функций store.
 *
 * @param key    — уникальный ключ (напр. 'workspaces', 'sections')
 * @param fn     — async функция, которую нужно защитить
 * @param opts   — { cooldownMs: число мс между повторными вызовами, force: обход cooldown }
 * @returns Promise<void>
 *
 * @example
 * fetchWorkspaces: async (force = false) => {
 *   return guardedFetch('workspaces', async () => {
 *     set({ loading: true });
 *     const data = await api.getAll();
 *     set({ data, loading: false });
 *   }, { cooldownMs: 2000, force });
 * }
 */
export function guardedFetch(
  key: string,
  fn: () => Promise<void>,
  opts: { cooldownMs?: number; force?: boolean } = {},
): Promise<void> {
  const { cooldownMs = 2000, force = false } = opts;

  let state = guards.get(key);
  if (!state) {
    state = { pending: null, lastDoneAt: 0 };
    guards.set(key, state);
  }

  // Cooldown: если данные свежие и не force — пропускаем
  if (!force && state.lastDoneAt > 0 && Date.now() - state.lastDoneAt < cooldownMs) {
    return Promise.resolve();
  }

  // Dedup: если уже летит запрос — возвращаем тот же Promise
  if (state.pending) {
    return state.pending;
  }

  // Запускаем
  state.pending = fn().finally(() => {
    state!.lastDoneAt = Date.now();
    state!.pending = null;
  });

  return state.pending;
}

/**
 * Сброс guard-состояния (при logout).
 * Позволяет следующему логину сразу загрузить данные без cooldown.
 */
export function resetFetchGuards(): void {
  guards.clear();
}
