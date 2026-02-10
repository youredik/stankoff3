'use client';

import { useState } from 'react';
import {
  CheckCircle2,
  Hand,
  ArrowLeftRight,
  X,
  Loader2,
} from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import type { UserTask, User } from '@/types';

interface TaskActionsProps {
  task: UserTask;
  currentUserId: string;
  onClaim: () => Promise<void>;
  onUnclaim: () => Promise<void>;
  onComplete: (formData: Record<string, unknown>) => Promise<void>;
  onDelegate: (targetUserId: string) => Promise<void>;
  users?: User[];
  disabled?: boolean;
}

export function TaskActions({
  task,
  currentUserId,
  onClaim,
  onUnclaim,
  onComplete,
  onDelegate,
  users = [],
  disabled = false,
}: TaskActionsProps) {
  const [isLoading, setIsLoading] = useState<string | null>(null);
  const [showDelegateModal, setShowDelegateModal] = useState(false);

  const isAssignedToMe = task.assigneeId === currentUserId;
  const canClaim = task.status === 'created';
  const canUnclaim = task.status === 'claimed' && isAssignedToMe;
  const canComplete = (task.status === 'claimed' || task.status === 'delegated') && isAssignedToMe;
  const canDelegate = task.status === 'claimed' && isAssignedToMe;

  const handleAction = async (
    action: 'claim' | 'unclaim' | 'complete' | 'delegate',
    handler: () => Promise<void>
  ) => {
    setIsLoading(action);
    try {
      await handler();
    } catch (err) {
      console.error(`Failed to ${action} task:`, err);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Claim */}
      {canClaim && (
        <button
          onClick={() => handleAction('claim', onClaim)}
          disabled={disabled || isLoading !== null}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading === 'claim' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Hand className="w-4 h-4" />
          )}
          Взять в работу
        </button>
      )}

      {/* Unclaim */}
      {canUnclaim && (
        <button
          onClick={() => handleAction('unclaim', onUnclaim)}
          disabled={disabled || isLoading !== null}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading === 'unclaim' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <X className="w-4 h-4" />
          )}
          Отказаться
        </button>
      )}

      {/* Complete */}
      {canComplete && (
        <button
          onClick={() => handleAction('complete', () => onComplete({}))}
          disabled={disabled || isLoading !== null}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading === 'complete' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          Завершить
        </button>
      )}

      {/* Delegate */}
      {canDelegate && (
        <button
          onClick={() => setShowDelegateModal(true)}
          disabled={disabled || isLoading !== null}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/30 hover:bg-purple-200 dark:hover:bg-purple-900/50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <ArrowLeftRight className="w-4 h-4" />
          Делегировать
        </button>
      )}

      {/* Delegate Modal */}
      {showDelegateModal && (
        <DelegateModal
          users={users.filter((u) => u.id !== currentUserId)}
          isLoading={isLoading === 'delegate'}
          onDelegate={async (userId) => {
            await handleAction('delegate', () => onDelegate(userId));
            setShowDelegateModal(false);
          }}
          onClose={() => setShowDelegateModal(false)}
        />
      )}
    </div>
  );
}

interface DelegateModalProps {
  users: User[];
  isLoading: boolean;
  onDelegate: (userId: string) => void;
  onClose: () => void;
}

function DelegateModal({ users, isLoading, onDelegate, onClose }: DelegateModalProps) {
  const [selectedUserId, setSelectedUserId] = useState<string>('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-lg shadow-xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Делегировать задачу
          </h3>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4">
          {users.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              Нет доступных пользователей для делегирования
            </p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {users.map((user) => (
                <label
                  key={user.id}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                    selectedUserId === user.id
                      ? 'bg-teal-50 dark:bg-teal-900/30 border-2 border-teal-500'
                      : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="delegate-user"
                    value={user.id}
                    checked={selectedUserId === user.id}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    className="sr-only"
                  />
                  <UserAvatar
                    firstName={user.firstName}
                    lastName={user.lastName}
                    userId={user.id}
                    size="md"
                  />
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {user.email}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Отмена
          </button>
          <button
            onClick={() => selectedUserId && onDelegate(selectedUserId)}
            disabled={!selectedUserId || isLoading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            Делегировать
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskActions;
