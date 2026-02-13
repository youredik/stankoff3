import type { User } from '@/types';

export interface MentionSuggestionState {
  items: User[];
  clientRect: (() => DOMRect | null) | null;
  command: (props: { id: string; label: string }) => void;
}

interface MentionSuggestionCallbacks {
  onStateChange: (state: MentionSuggestionState | null) => void;
  onSelectedIndexChange: (index: number) => void;
  getSelectedIndex: () => number;
}

/**
 * Creates a Tiptap Mention suggestion config.
 * Manages dropdown state externally via callbacks (React setState).
 */
export function createMentionSuggestion(
  users: User[],
  callbacks: MentionSuggestionCallbacks,
) {
  let current: any = null;

  return {
    items: ({ query }: { query: string }) =>
      users
        .filter((u) =>
          `${u.firstName} ${u.lastName}`
            .toLowerCase()
            .includes(query.toLowerCase()),
        )
        .slice(0, 5),

    render: () => ({
      onStart: (props: any) => {
        current = props;
        callbacks.onSelectedIndexChange(0);
        callbacks.onStateChange({
          items: props.items,
          clientRect: props.clientRect,
          command: props.command,
        });
      },
      onUpdate: (props: any) => {
        current = props;
        callbacks.onSelectedIndexChange(0);
        callbacks.onStateChange({
          items: props.items,
          clientRect: props.clientRect,
          command: props.command,
        });
      },
      onExit: () => {
        current = null;
        callbacks.onStateChange(null);
      },
      onKeyDown: ({ event }: { event: KeyboardEvent }) => {
        if (!current) return false;

        if (event.key === 'ArrowDown') {
          event.preventDefault();
          const next = Math.min(
            callbacks.getSelectedIndex() + 1,
            current.items.length - 1,
          );
          callbacks.onSelectedIndexChange(next);
          return true;
        }

        if (event.key === 'ArrowUp') {
          event.preventDefault();
          const prev = Math.max(callbacks.getSelectedIndex() - 1, 0);
          callbacks.onSelectedIndexChange(prev);
          return true;
        }

        if (event.key === 'Enter' || event.key === 'Tab') {
          event.preventDefault();
          const item = current.items[callbacks.getSelectedIndex()];
          if (item) {
            current.command({
              id: item.id,
              label: `${item.firstName} ${item.lastName}`,
            });
          }
          return true;
        }

        if (event.key === 'Escape') {
          callbacks.onStateChange(null);
          return true;
        }

        return false;
      },
    }),
  };
}
