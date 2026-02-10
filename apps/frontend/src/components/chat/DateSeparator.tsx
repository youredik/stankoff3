'use client';

import { format, isToday, isYesterday } from 'date-fns';
import { ru } from 'date-fns/locale';

interface DateSeparatorProps {
  date: string;
}

export function DateSeparator({ date }: DateSeparatorProps) {
  const d = new Date(date);
  let label: string;

  if (isToday(d)) {
    label = 'Сегодня';
  } else if (isYesterday(d)) {
    label = 'Вчера';
  } else {
    label = format(d, 'd MMMM yyyy', { locale: ru });
  }

  return (
    <div className="flex justify-center my-3">
      <span className="text-xs bg-black/[0.08] dark:bg-white/[0.08] text-gray-600 dark:text-gray-300 px-3 py-1 rounded-full font-medium">
        {label}
      </span>
    </div>
  );
}
