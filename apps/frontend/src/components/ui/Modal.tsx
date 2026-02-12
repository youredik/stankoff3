'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  titleId?: string;
  children: ReactNode;
  /** Width class, default w-[440px] */
  className?: string;
  /** Show close button in header, default true */
  showClose?: boolean;
}

/**
 * Общий Modal компонент с:
 * - Focus trap (Tab cycles внутри модалки)
 * - Escape для закрытия
 * - Overlay click для закрытия
 * - Анимация fade-in
 * - role="dialog", aria-modal="true"
 */
export function Modal({
  open,
  onClose,
  title,
  titleId,
  children,
  className = 'w-[440px]',
  showClose = true,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Focus trap + Escape
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;

        const focusable = dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Auto-focus first focusable element
    const dialog = dialogRef.current;
    if (dialog) {
      const first = dialog.querySelector<HTMLElement>(
        'input:not([type="hidden"]), button, [tabindex]:not([tabindex="-1"])',
      );
      first?.focus();
    }

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const resolvedTitleId = titleId || (title ? 'modal-title' : undefined);

  return (
    <>
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.15s ease-out' }}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={resolvedTitleId}
          className={`bg-white dark:bg-gray-900 rounded-xl shadow-xl max-w-[90vw] max-h-[85vh] flex flex-col ${className}`}
          style={{ animation: 'slideUp 0.2s ease-out' }}
        >
          {title && (
            <div className="flex items-center justify-between p-5 border-b dark:border-gray-700 flex-shrink-0">
              <h3 id={resolvedTitleId} className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {title}
              </h3>
              {showClose && (
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded cursor-pointer"
                  aria-label="Закрыть"
                >
                  <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                </button>
              )}
            </div>
          )}
          {children}
        </div>
      </div>
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
