'use client';

import { format, formatDistanceToNow, isPast } from 'date-fns';
import { ru } from 'date-fns/locale';
import {
  Clock,
  User,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Users,
} from 'lucide-react';
import type { UserTask, UserTaskStatus } from '@/types';

interface TaskCardProps {
  task: UserTask;
  onClick?: (task: UserTask) => void;
  onClaim?: (task: UserTask) => void;
  compact?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onSelectToggle?: (taskId: string) => void;
}

const statusConfig: Record<
  UserTaskStatus,
  { label: string; color: string; bgColor: string }
> = {
  created: {
    label: 'Ожидает',
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
  },
  claimed: {
    label: 'В работе',
    color: 'text-yellow-600 dark:text-yellow-400',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
  },
  completed: {
    label: 'Завершено',
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
  },
  delegated: {
    label: 'Делегировано',
    color: 'text-purple-600 dark:text-purple-400',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
  },
  cancelled: {
    label: 'Отменено',
    color: 'text-gray-600 dark:text-gray-400',
    bgColor: 'bg-gray-100 dark:bg-gray-900/30',
  },
};

const taskTypeLabels: Record<string, string> = {
  approval: 'Согласование',
  review: 'Проверка',
  'data-entry': 'Ввод данных',
  custom: 'Задача',
};

function getPriorityStyle(priority: number): string {
  if (priority >= 80) return 'border-l-red-500';
  if (priority >= 60) return 'border-l-orange-500';
  if (priority >= 40) return 'border-l-yellow-500';
  return 'border-l-gray-300 dark:border-l-gray-600';
}

export function TaskCard({ task, onClick, onClaim, compact = false, selectable, selected, onSelectToggle }: TaskCardProps) {
  const status = statusConfig[task.status] || statusConfig.created;
  const isOverdue = task.dueDate && isPast(new Date(task.dueDate)) && task.status !== 'completed';

  const handleClick = () => {
    if (onClick) onClick(task);
  };

  const handleClaim = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClaim) onClaim(task);
  };

  const handleCheckbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onSelectToggle) onSelectToggle(task.id);
  };

  if (compact) {
    return (
      <div
        onClick={handleClick}
        className={`flex items-center justify-between p-3 bg-white dark:bg-gray-800 border-l-4 ${getPriorityStyle(task.priority)} border border-gray-200 dark:border-gray-700 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={`px-2 py-0.5 text-xs font-medium rounded ${status.bgColor} ${status.color}`}>
            {status.label}
          </span>
          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {task.elementName || task.elementId}
          </span>
        </div>
        {task.dueDate && (
          <span className={`text-xs ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
            {format(new Date(task.dueDate), 'd MMM', { locale: ru })}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      className={`p-4 bg-white dark:bg-gray-800 border-l-4 ${getPriorityStyle(task.priority)} border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-teal-300 dark:hover:border-teal-600 transition-colors ${selected ? 'ring-2 ring-teal-500 ring-offset-1 dark:ring-offset-gray-900' : ''}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-start gap-3 min-w-0">
          {selectable && (
            <button
              onClick={handleCheckbox}
              className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selected
                  ? 'bg-teal-500 border-teal-500 text-white'
                  : 'border-gray-300 dark:border-gray-600 hover:border-teal-400'
              }`}
            >
              {selected && <CheckCircle2 className="w-3 h-3" />}
            </button>
          )}
          <div className="min-w-0">
            <h3 className="font-medium text-gray-900 dark:text-white truncate">
              {task.elementName || task.elementId}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {taskTypeLabels[task.taskType] || task.taskType}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded shrink-0 ${status.bgColor} ${status.color}`}>
          {status.label}
        </span>
      </div>

      {/* Entity link if present */}
      {task.entity && (
        <div className="mb-3 text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1">
          <ArrowRight className="w-3 h-3" />
          <span className="truncate">{task.entity.customId}: {task.entity.title}</span>
        </div>
      )}

      {/* Meta info */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
        {/* Assignee or Candidates */}
        {task.assignee ? (
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {task.assignee.firstName} {task.assignee.lastName}
          </span>
        ) : task.candidateGroups.length > 0 ? (
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" />
            {task.candidateGroups.slice(0, 2).join(', ')}
            {task.candidateGroups.length > 2 && ` +${task.candidateGroups.length - 2}`}
          </span>
        ) : null}

        {/* Due date */}
        {task.dueDate && (
          <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500' : ''}`}>
            {isOverdue ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
            {isOverdue
              ? `Просрочено ${formatDistanceToNow(new Date(task.dueDate), { locale: ru })}`
              : format(new Date(task.dueDate), 'd MMM HH:mm', { locale: ru })}
          </span>
        )}

        {/* Created date */}
        <span className="flex items-center gap-1 ml-auto">
          <Clock className="w-3 h-3" />
          {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true, locale: ru })}
        </span>
      </div>

      {/* Actions */}
      {task.status === 'created' && onClaim && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={handleClaim}
            className="w-full py-1.5 text-sm font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded transition-colors"
          >
            Взять в работу
          </button>
        </div>
      )}
    </div>
  );
}

export default TaskCard;
