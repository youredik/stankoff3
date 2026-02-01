'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  Bold,
  Italic,
  Link as LinkIcon,
  Paperclip,
  X,
  FileText,
  Image,
  Loader2,
} from 'lucide-react';
import { filesApi } from '@/lib/api/files';
import type { User, Attachment } from '@/types';

interface CommentEditorProps {
  users: User[];
  onSubmit: (content: string, attachments?: Attachment[]) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

export function CommentEditor({ users, onSubmit }: CommentEditorProps) {
  const [mentionState, setMentionState] = useState<{
    items: User[];
    clientRect: () => DOMRect | null;
    command: (props: { id: string; label: string }) => void;
  } | null>(null);
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({
        placeholder: 'Добавить комментарий… (Ctrl+Enter — отправить)',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'text-primary-600 bg-primary-50 rounded px-0.5',
        },
        suggestion: {
          items: ({ query }) =>
            users
              .filter((u) =>
                `${u.firstName} ${u.lastName}`
                  .toLowerCase()
                  .includes(query.toLowerCase())
              )
              .slice(0, 5),
          render: () => {
            let current: any = null;
            return {
              onStart: (props: any) => {
                current = props;
                selectedIndexRef.current = 0;
                setSelectedIndex(0);
                setMentionState({
                  items: props.items,
                  clientRect: props.clientRect,
                  command: props.command,
                });
              },
              onUpdate: (props: any) => {
                current = props;
                selectedIndexRef.current = 0;
                setSelectedIndex(0);
                setMentionState({
                  items: props.items,
                  clientRect: props.clientRect,
                  command: props.command,
                });
              },
              onExit: () => {
                current = null;
                setMentionState(null);
              },
              onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                if (!current) return false;
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  const next = Math.min(
                    selectedIndexRef.current + 1,
                    current.items.length - 1
                  );
                  selectedIndexRef.current = next;
                  setSelectedIndex(next);
                  return true;
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  const prev = Math.max(selectedIndexRef.current - 1, 0);
                  selectedIndexRef.current = prev;
                  setSelectedIndex(prev);
                  return true;
                }
                if (event.key === 'Enter' || event.key === 'Tab') {
                  event.preventDefault();
                  const item = current.items[selectedIndexRef.current];
                  if (item) {
                    current.command({
                      id: item.id,
                      label: `${item.firstName} ${item.lastName}`,
                    });
                  }
                  return true;
                }
                if (event.key === 'Escape') {
                  setMentionState(null);
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[60px] p-3 text-sm text-gray-900 focus:outline-none',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          event.preventDefault();
          handleSubmit();
          return true;
        }
        return false;
      },
    },
  });

  const handleSubmit = useCallback(() => {
    if (!editor || (editor.isEmpty && attachments.length === 0)) return;
    onSubmit(editor.getHTML(), attachments.length > 0 ? attachments : undefined);
    editor.commands.clearContent();
    setAttachments([]);
  }, [editor, onSubmit, attachments]);

  const handleLinkClick = () => {
    const url = window.prompt('Введите URL:');
    if (url && editor) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);

    try {
      const uploadPromises = Array.from(files).map((file) =>
        filesApi.upload(file)
      );
      const uploaded = await Promise.all(uploadPromises);
      setAttachments((prev) => [...prev, ...uploaded]);
    } catch (err) {
      console.error('Upload failed:', err);
      // Could show an error toast here
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // @mention dropdown via portal
  const mentionDropdown =
    mentionState &&
    mentionState.items.length > 0 &&
    typeof document !== 'undefined' &&
    (() => {
      const rect = mentionState.clientRect?.();
      if (!rect) return null;
      return createPortal(
        <div
          className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-52"
          style={{ top: rect.bottom + 4, left: rect.left }}
        >
          {mentionState.items.map((user, i) => (
            <button
              key={user.id}
              className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                i === selectedIndex
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                mentionState.command({
                  id: user.id,
                  label: `${user.firstName} ${user.lastName}`,
                });
              }}
            >
              <div className="w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs">{user.firstName[0]}</span>
              </div>
              <span>
                {user.firstName} {user.lastName}
              </span>
            </button>
          ))}
        </div>,
        document.body
      );
    })();

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
      <EditorContent editor={editor} />

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1 group"
            >
              {isImageMimeType(attachment.mimeType) ? (
                <Image className="w-4 h-4 text-gray-500" />
              ) : (
                <FileText className="w-4 h-4 text-gray-500" />
              )}
              <span className="text-xs text-gray-700 max-w-[100px] truncate">
                {attachment.name}
              </span>
              <span className="text-xs text-gray-400">
                {formatFileSize(attachment.size)}
              </span>
              <button
                onClick={() => handleRemoveAttachment(attachment.id)}
                className="p-0.5 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
        accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
      />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 bg-gray-50">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
              editor?.isActive('bold') ? 'bg-gray-200' : ''
            }`}
            title="Жирный (Ctrl+B)"
          >
            <Bold className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
              editor?.isActive('italic') ? 'bg-gray-200' : ''
            }`}
            title="Курсив (Ctrl+I)"
          >
            <Italic className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={handleLinkClick}
            className={`p-1.5 rounded hover:bg-gray-200 transition-colors ${
              editor?.isActive('link') ? 'bg-gray-200' : ''
            }`}
            title="Ссылка"
          >
            <LinkIcon className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors disabled:opacity-50"
            title="Прикрепить файл"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 text-gray-600 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4 text-gray-600" />
            )}
          </button>
          <span className="text-xs text-gray-400 ml-2">@ — упоминание</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="px-3 py-1 bg-primary-600 text-white rounded text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          Отправить
        </button>
      </div>

      {mentionDropdown}
    </div>
  );
}
