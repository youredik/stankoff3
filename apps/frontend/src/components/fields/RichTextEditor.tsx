'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Bold, Italic, Strikethrough, Link as LinkIcon, List, ListOrdered } from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
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

export function RichTextEditor({ value, onChange, placeholder, editable = true, className }: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
      }),
      Placeholder.configure({ placeholder: placeholder || 'Введите текст...' }),
    ],
    content: value || '',
    editable,
    editorProps: {
      attributes: {
        class: `prose prose-sm dark:prose-invert max-w-none min-h-[60px] p-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none ${className || ''}`,
      },
    },
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      onChange(html === '<p></p>' ? '' : html);
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
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

// Read-only отображение HTML контента
export function RichTextView({ html }: { html: string }) {
  if (!html) return <span className="text-gray-400 dark:text-gray-500 text-sm">—</span>;
  return (
    <div
      className="prose prose-sm dark:prose-invert max-w-none text-gray-700 dark:text-gray-300"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
