'use client';

import { Fragment, ReactNode } from 'react';
import { ChevronRight, Home } from 'lucide-react';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: ReactNode;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  if (items.length === 0) return null;

  return (
    <nav aria-label="Навигация" className="flex items-center gap-1 text-sm overflow-hidden">
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        const isClickable = !isLast && (item.href || item.onClick);

        return (
          <Fragment key={index}>
            {index > 0 && (
              <ChevronRight className="w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0" />
            )}
            {isClickable ? (
              <button
                onClick={item.onClick}
                className="flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors truncate max-w-[150px]"
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ) : (
              <span
                className={`flex items-center gap-1 truncate max-w-[200px] ${
                  isLast
                    ? 'text-gray-900 dark:text-gray-100 font-medium'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}

// Helper function to create home breadcrumb
export function createHomeBreadcrumb(): BreadcrumbItem {
  return {
    label: 'Главная',
    icon: <Home className="w-4 h-4" />,
    href: '/dashboard',
  };
}
