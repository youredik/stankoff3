'use client';

import { X, Keyboard } from 'lucide-react';
import { GLOBAL_SHORTCUTS } from '@/hooks/useKeyboardShortcuts';

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

export function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="shortcuts-title"
          className="bg-white dark:bg-gray-900 rounded-xl shadow-xl w-[400px] max-h-[80vh] overflow-hidden"
        >
          <div className="flex items-center justify-between p-5 border-b dark:border-gray-700">
            <div className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-gray-500" />
              <h3 id="shortcuts-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                Клавиатурные сокращения
              </h3>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>

          <div className="p-5">
            <div className="space-y-3">
              {GLOBAL_SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{s.description}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((key, j) => (
                      <span key={j}>
                        {j > 0 && <span className="text-gray-400 mx-0.5">+</span>}
                        <kbd className="px-2 py-1 text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded shadow-sm">
                          {key}
                        </kbd>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
