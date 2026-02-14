'use client';

import { useState, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { sanitizeHtml } from '@/lib/sanitize';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Strikethrough, Link as LinkIcon, List, ListOrdered } from 'lucide-react';
import { MentionDropdown } from '@/components/ui/MentionDropdown';
import { createMentionSuggestion, type MentionSuggestionState } from '@/lib/tiptap/mention-suggestion';
import { extractMentionIds } from '@/lib/tiptap/parse-mentions';
import type { User } from '@/types';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
  users?: User[];
  onMentionedUserIds?: (ids: string[]) => void;
}

function ToolbarButton({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`p-1 rounded transition-colors ${
        active
          ? 'bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
      }`}
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ value, onChange, placeholder, editable = true, className, users, onMentionedUserIds }: RichTextEditorProps) {
  const [mentionState, setMentionState] = useState<MentionSuggestionState | null>(null);
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const extensions = [
    StarterKit.configure({
      link: { openOnClick: false },
    }),
    Placeholder.configure({ placeholder: placeholder || 'Введите текст...' }),
  ];

  if (users && users.length > 0) {
    extensions.push(
      Mention.configure({
        HTMLAttributes: {
          class: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 rounded px-0.5',
        },
        suggestion: createMentionSuggestion(users, {
          onStateChange: setMentionState,
          onSelectedIndexChange: (idx) => { selectedIndexRef.current = idx; setSelectedIndex(idx); },
          getSelectedIndex: () => selectedIndexRef.current,
        }),
      }) as any,
    );
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    content: value || '',
    editable,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none min-h-[60px] p-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none ${className || ''}`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      const cleaned = html === '<p></p>' ? '' : html;
      onChange(cleaned);
      if (onMentionedUserIds && cleaned) {
        onMentionedUserIds(extractMentionIds(cleaned));
      }
    },
  });

  if (!editor) return null;

  const addLink = () => {
    const url = window.prompt('URL:');
    if (url) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-700">
      {editable && (
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
          <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="w-3.5 h-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="w-3.5 h-3.5" />
          </ToolbarButton>
          <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="w-3.5 h-3.5" />
          </ToolbarButton>
          <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-1" />
          <ToolbarButton active={editor.isActive('link')} onClick={addLink}>
            <LinkIcon className="w-3.5 h-3.5" />
          </ToolbarButton>
          {users && users.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">@ — упоминание</span>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
      {mentionState && (
        <MentionDropdown
          items={mentionState.items}
          selectedIndex={selectedIndex}
          clientRect={mentionState.clientRect}
          onSelect={(u) => {
            mentionState.command({
              id: u.id,
              label: `${u.firstName} ${u.lastName}`,
            });
          }}
        />
      )}
    </div>
  );
}

// Read-only отображение HTML контента
export function RichTextView({ html }: { html: string }) {
  if (!html) return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300 [&_[data-type=mention]]:text-primary-600 [&_[data-type=mention]]:dark:text-primary-400 [&_[data-type=mention]]:bg-primary-50 [&_[data-type=mention]]:dark:bg-primary-900/40 [&_[data-type=mention]]:rounded [&_[data-type=mention]]:px-0.5 [&_[data-type=mention]]:font-medium"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}
