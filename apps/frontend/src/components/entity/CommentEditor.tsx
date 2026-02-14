'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { useState, useRef, useCallback, useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import {
  Bold,
  Italic,
  Strikethrough,
  Link as LinkIcon,
  Paperclip,
  X,
  FileText,
  Film,
  Loader2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { filesApi } from '@/lib/api/files';
import { aiApi } from '@/lib/api/ai';
import { MentionDropdown } from '@/components/ui/MentionDropdown';
import { createMentionSuggestion, type MentionSuggestionState } from '@/lib/tiptap/mention-suggestion';
import type { User, UploadedAttachment } from '@/types';

interface CommentEditorProps {
  users: User[];
  onSubmit: (content: string, attachments?: UploadedAttachment[]) => void;
  entityId?: string;
  onEditorReady?: (editor: Editor) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

export function CommentEditor({ users, onSubmit, entityId, onEditorReady }: CommentEditorProps) {
  const [mentionState, setMentionState] = useState<MentionSuggestionState | null>(null);
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI draft state
  const [aiDraft, setAiDraft] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false },
      }),
      Placeholder.configure({
        placeholder: 'Добавить комментарий… (Ctrl+Enter — отправить)',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/40 rounded px-0.5',
        },
        suggestion: createMentionSuggestion(users, {
          onStateChange: setMentionState,
          onSelectedIndexChange: (idx) => {
            selectedIndexRef.current = idx;
            setSelectedIndex(idx);
          },
          getSelectedIndex: () => selectedIndexRef.current,
        }),
      }),
    ],
    editorProps: {
      attributes: {
        class: 'min-h-[60px] p-3 text-sm text-gray-900 dark:text-gray-100 focus:outline-none',
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

  // Expose editor to parent
  useEffect(() => {
    if (editor && onEditorReady) onEditorReady(editor);
  }, [editor, onEditorReady]);

  // AI: generate response suggestion
  const handleAiSuggest = useCallback(async () => {
    if (!entityId || aiLoading) return;
    setAiLoading(true);
    try {
      const response = await aiApi.suggestResponse(entityId);
      setAiDraft(response.draft);
    } catch {
      setAiDraft(null);
    } finally {
      setAiLoading(false);
    }
  }, [entityId, aiLoading]);

  // AI: insert draft into editor
  const handleInsertDraft = useCallback(() => {
    if (!aiDraft || !editor) return;
    editor.chain().focus().insertContent(aiDraft).run();
    setAiDraft(null);
  }, [aiDraft, editor]);

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
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500 bg-white dark:bg-gray-800">
      <EditorContent editor={editor} />

      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="px-3 py-2 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="relative group"
            >
              {isImageMimeType(attachment.mimeType) ? (
                <div className="w-16 h-16 rounded overflow-hidden bg-gray-200 dark:bg-gray-700">
                  <img
                    src={attachment.thumbnailUrl || attachment.url}
                    alt={attachment.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : isVideoMimeType(attachment.mimeType) ? (
                <div className="w-16 h-16 rounded overflow-hidden bg-gray-800 flex items-center justify-center">
                  <Film className="w-6 h-6 text-white" />
                </div>
              ) : (
                <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded px-2 py-1">
                  <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                  <span className="text-xs text-gray-700 dark:text-gray-300 max-w-[100px] truncate">
                    {attachment.name}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">
                    {formatFileSize(attachment.size)}
                  </span>
                </div>
              )}
              <button
                onClick={() => handleRemoveAttachment(attachment.id)}
                className="absolute -top-1 -right-1 p-0.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
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
        accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
      />

      {/* AI Draft Block */}
      {aiDraft && (
        <div className="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-teal-50 dark:bg-teal-900/20">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-teal-500" />
              <span className="text-xs font-medium text-teal-700 dark:text-teal-300">AI предлагает:</span>
            </div>
            <button
              onClick={() => setAiDraft(null)}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
              aria-label="Закрыть AI-предложение"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-2 line-clamp-4">
            {aiDraft}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInsertDraft}
              className="px-2.5 py-1 bg-teal-500 text-white rounded text-xs font-medium hover:bg-teal-600 transition-colors"
            >
              Вставить
            </button>
            <button
              onClick={handleAiSuggest}
              disabled={aiLoading}
              className="px-2.5 py-1 text-teal-600 dark:text-teal-400 rounded text-xs font-medium hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 inline mr-1 ${aiLoading ? 'animate-spin' : ''}`} />
              Другой вариант
            </button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => editor?.chain().focus().toggleBold().run()}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
              editor?.isActive('bold') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Жирный (Ctrl+B)"
          >
            <Bold className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleItalic().run()}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
              editor?.isActive('italic') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Курсив (Ctrl+I)"
          >
            <Italic className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => editor?.chain().focus().toggleStrike().run()}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
              editor?.isActive('strike') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Зачёркнутый (Ctrl+Shift+S)"
          >
            <Strikethrough className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={handleLinkClick}
            className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
              editor?.isActive('link') ? 'bg-gray-200 dark:bg-gray-700' : ''
            }`}
            title="Ссылка"
          >
            <LinkIcon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            title="Прикрепить файл"
          >
            {uploading ? (
              <Loader2 className="w-4 h-4 text-gray-600 dark:text-gray-400 animate-spin" />
            ) : (
              <Paperclip className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
          {entityId && (
            <button
              onClick={handleAiSuggest}
              disabled={aiLoading}
              className="p-1.5 rounded hover:bg-teal-100 dark:hover:bg-teal-900/30 transition-colors disabled:opacity-50 ml-0.5"
              title="AI: предложить ответ"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 text-teal-500 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4 text-teal-500" />
              )}
            </button>
          )}
          <span className="text-xs text-gray-400 dark:text-gray-500 ml-2">@ — упоминание</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={uploading}
          className="px-3 py-1 bg-primary-600 text-white rounded text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
        >
          Отправить
        </button>
      </div>

      {mentionState && (
        <MentionDropdown
          items={mentionState.items}
          selectedIndex={selectedIndex}
          clientRect={mentionState.clientRect}
          onSelect={(user) => {
            mentionState.command({
              id: user.id,
              label: `${user.firstName} ${user.lastName}`,
            });
          }}
        />
      )}
    </div>
  );
}
