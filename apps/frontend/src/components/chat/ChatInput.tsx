'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { Send, Paperclip, X, Mic, FileText, Smile, Image, Loader2 } from 'lucide-react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import type { ChatMessage, ChatMessageAttachment } from '@/types';
import { getSocket } from '@/lib/socket';
import { apiClient } from '@/lib/api/client';
import { useEntityStore } from '@/store/useEntityStore';
import { MentionDropdown } from '@/components/ui/MentionDropdown';
import { createMentionSuggestion, type MentionSuggestionState } from '@/lib/tiptap/mention-suggestion';
import { extractMentionIds } from '@/lib/tiptap/parse-mentions';

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatMessageAttachment[], mentionedUserIds?: string[]) => void;
  onSendVoice: (voiceKey: string, duration: number, waveform: number[]) => void;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  conversationId: string;
  isAiChat?: boolean;
}

interface PendingFile {
  file: File;
  preview?: string;
  uploadProgress?: number;
  uploadStatus?: 'pending' | 'uploading' | 'done' | 'error';
}

export function ChatInput({
  onSend,
  onSendVoice,
  replyTo,
  onCancelReply,
  conversationId,
  isAiChat,
}: ChatInputProps) {
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [clipboardImage, setClipboardImage] = useState<{ blob: Blob; preview: string } | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const waveformRef = useRef<number[]>([]);
  const recordingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordingStartRef = useRef(0);

  // Mention state
  const [mentionState, setMentionState] = useState<MentionSuggestionState | null>(null);
  const selectedIndexRef = useRef(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const users = useEntityStore((s) => s.users);
  const fetchUsers = useEntityStore((s) => s.fetchUsers);

  // Ensure users are loaded
  useEffect(() => {
    if (users.length === 0) fetchUsers();
  }, [users.length, fetchUsers]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false },
      }),
      Placeholder.configure({
        placeholder: isAiChat ? 'Спросите AI ассистента...' : 'Сообщение...',
      }),
      Mention.configure({
        HTMLAttributes: {
          class: 'text-primary-500 dark:text-primary-400 font-medium',
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
        class: 'w-full resize-none bg-transparent px-4 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-100 focus:outline-none max-h-[200px] overflow-y-auto [&>p]:m-0',
      },
      handleKeyDown: (_view, event) => {
        // Enter without Shift = send
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          handleSend();
          return true;
        }
        return false;
      },
    },
    onUpdate: () => {
      // Typing indicator
      if (typingTimeoutRef.current) return;
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('chat:typing', { conversationId });
      }
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    },
  });

  // Focus on mount and when replying
  useEffect(() => {
    editor?.commands.focus();
  }, [replyTo, editor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // Check clipboard for images on window focus
  useEffect(() => {
    const checkClipboard = async () => {
      try {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imageType = item.types.find(t => t.startsWith('image/'));
          if (imageType) {
            const blob = await item.getType(imageType);
            const preview = URL.createObjectURL(blob);
            setClipboardImage(prev => {
              if (prev) URL.revokeObjectURL(prev.preview);
              return { blob, preview };
            });
            return;
          }
        }
        setClipboardImage(prev => {
          if (prev) URL.revokeObjectURL(prev.preview);
          return null;
        });
      } catch {
        // Clipboard API not available or permission denied — ignore silently
      }
    };
    checkClipboard();
    window.addEventListener('focus', checkClipboard);
    return () => {
      window.removeEventListener('focus', checkClipboard);
    };
  }, []);

  // Close emoji picker on click outside
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  const handleEmojiClick = useCallback((emojiData: EmojiClickData) => {
    editor?.commands.insertContent(emojiData.emoji);
    editor?.commands.focus();
  }, [editor]);

  const uploadFile = async (file: File | Blob, filename?: string, onProgress?: (pct: number) => void): Promise<{ key: string } | null> => {
    const formData = new FormData();
    formData.append('file', file, filename || (file instanceof File ? file.name : 'file'));
    try {
      const res = await apiClient.post<{ key: string; url: string }>('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (e) => {
          if (e.total && onProgress) onProgress(Math.round((e.loaded * 100) / e.total));
        },
      });
      return { key: res.data.key };
    } catch {
      return null;
    }
  };

  const handleSend = useCallback(async () => {
    const html = editor?.getHTML() || '';
    const text = editor?.getText() || '';
    const hasContent = text.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if (!hasContent && !hasFiles) return;

    let attachments: ChatMessageAttachment[] = [];

    if (hasFiles) {
      setUploading(true);
      // Mark all files as pending upload
      setPendingFiles(prev => prev.map(f => ({ ...f, uploadStatus: 'pending' as const, uploadProgress: 0 })));
      try {
        const results = await Promise.all(
          pendingFiles.map(async (pf, index) => {
            setPendingFiles(prev => prev.map((f, i) => i === index ? { ...f, uploadStatus: 'uploading' as const, uploadProgress: 0 } : f));
            const res = await uploadFile(pf.file, undefined, (pct) => {
              setPendingFiles(prev => prev.map((f, i) => i === index ? { ...f, uploadProgress: pct } : f));
            });
            if (!res) {
              setPendingFiles(prev => prev.map((f, i) => i === index ? { ...f, uploadStatus: 'error' as const } : f));
              return null;
            }
            setPendingFiles(prev => prev.map((f, i) => i === index ? { ...f, uploadStatus: 'done' as const, uploadProgress: 100 } : f));
            return {
              id: crypto.randomUUID(),
              name: pf.file.name,
              size: pf.file.size,
              key: res.key,
              mimeType: pf.file.type,
            } as ChatMessageAttachment;
          }),
        );
        attachments = results.filter((a): a is ChatMessageAttachment => a !== null);
      } finally {
        setUploading(false);
      }
    }

    const mentionedUserIds = extractMentionIds(html);
    onSend(
      html,
      attachments.length > 0 ? attachments : undefined,
      mentionedUserIds.length > 0 ? mentionedUserIds : undefined,
    );
    editor?.commands.clearContent();
    pendingFiles.forEach(pf => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
    setPendingFiles([]);
    editor?.commands.focus();
  }, [editor, pendingFiles, onSend]);

  // ─── File handling ─────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const newPending: PendingFile[] = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') || file.type.startsWith('video/') ? URL.createObjectURL(file) : undefined,
    }));
    setPendingFiles(prev => [...prev, ...newPending]);
  }, []);

  const removeFile = useCallback((index: number) => {
    setPendingFiles(prev => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const insertClipboardImage = useCallback(() => {
    if (!clipboardImage) return;
    const file = new File([clipboardImage.blob], `clipboard-${Date.now()}.png`, { type: clipboardImage.blob.type });
    addFiles([file]);
    URL.revokeObjectURL(clipboardImage.preview);
    setClipboardImage(null);
  }, [clipboardImage, addFiles]);

  const dismissClipboard = useCallback(() => {
    if (clipboardImage) URL.revokeObjectURL(clipboardImage.preview);
    setClipboardImage(null);
  }, [clipboardImage]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const mediaFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/') || items[i].type.startsWith('video/')) {
        const file = items[i].getAsFile();
        if (file) mediaFiles.push(file);
      }
    }
    if (mediaFiles.length > 0) {
      e.preventDefault();
      addFiles(mediaFiles);
      if (clipboardImage) {
        URL.revokeObjectURL(clipboardImage.preview);
        setClipboardImage(null);
      }
    }
  }, [addFiles, clipboardImage]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  // ─── Voice recording ───────────────────────────────────────

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      waveformRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        audioContext.close();

        const duration = Math.floor((Date.now() - recordingStartRef.current) / 1000);
        const waveform = normalizeWaveform(waveformRef.current, 30);

        const res = await uploadFile(blob, 'voice.webm');
        if (res) onSendVoice(res.key, duration, waveform);

        setRecording(false);
        setRecordingTime(0);
      };

      mediaRecorder.start(100);
      setRecording(true);
      setRecordingTime(0);
      recordingStartRef.current = Date.now();

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(Math.floor((Date.now() - recordingStartRef.current) / 1000));
        if (analyserRef.current) {
          const data = new Uint8Array(analyserRef.current.frequencyBinCount);
          analyserRef.current.getByteFrequencyData(data);
          const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
          waveformRef.current.push(avg / 255);
        }
      }, 100);
    } catch {
      // Microphone permission denied
    }
  }, [onSendVoice]);

  const stopRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    mediaRecorderRef.current?.stop();
  }, []);

  const cancelRecording = useCallback(() => {
    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
      recordingIntervalRef.current = null;
    }
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setRecording(false);
    setRecordingTime(0);
  }, []);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const hasContent = editor ? !editor.isEmpty : false;

  return (
    <div
      data-testid="chat-input" className={`bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 ${isDragOver ? 'ring-2 ring-primary-500 ring-inset' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div data-testid="chat-drop-zone" className="px-4 py-3 text-center text-sm text-primary-500 bg-primary-50 dark:bg-primary-900/20">
          Отпустите файлы для загрузки
        </div>
      )}

      {/* Clipboard image suggestion (Telegram-style) */}
      {clipboardImage && pendingFiles.length === 0 && !uploading && (
        <div data-testid="chat-clipboard-banner" className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 dark:border-gray-700 bg-primary-50/50 dark:bg-primary-900/10">
          <img src={clipboardImage.preview} alt="Буфер обмена" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Изображение в буфере обмена</span>
          </div>
          <button onClick={insertClipboardImage} className="text-xs font-medium text-primary-500 hover:text-primary-600 dark:text-primary-400 dark:hover:text-primary-300 px-2 py-1 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors">
            Вставить
          </button>
          <button onClick={dismissClipboard} className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors" aria-label="Скрыть">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {replyTo && (
        <div data-testid="chat-reply-preview" className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 dark:border-gray-700">
          <div className="w-0.5 h-8 bg-primary-500 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
              {replyTo.author?.firstName} {replyTo.author?.lastName}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {(replyTo.content || '').replace(/<[^>]*>/g, '').substring(0, 60)}
            </p>
          </div>
          <button data-testid="chat-cancel-reply-btn" onClick={onCancelReply} aria-label="Отменить ответ" className="p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {pendingFiles.length > 0 && (
        <div data-testid="chat-pending-files" className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-gray-100 dark:border-gray-700">
          {pendingFiles.map((pf, i) => (
            <div key={`${pf.file.name}-${pf.file.size}-${i}`} className="relative flex-shrink-0 group">
              {pf.preview && pf.file.type.startsWith('video/') ? (
                <div className="relative w-16 h-16">
                  <video src={pf.preview} className="w-16 h-16 object-cover rounded-lg" muted preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-lg">
                    <div className="w-6 h-6 rounded-full bg-white/80 flex items-center justify-center"><span className="text-[10px] ml-0.5">▶</span></div>
                  </div>
                </div>
              ) : pf.preview ? (
                <img src={pf.preview} alt={pf.file.name} className="w-16 h-16 object-cover rounded-lg" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex flex-col items-center justify-center">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className="text-[9px] text-gray-400 truncate max-w-[56px] mt-0.5">
                    {pf.file.name.split('.').pop()}
                  </span>
                </div>
              )}
              {/* Upload progress overlay */}
              {pf.uploadStatus === 'uploading' && (
                <div className="absolute inset-0 bg-black/50 rounded-lg flex items-center justify-center">
                  <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
                    <circle cx="18" cy="18" r="14" fill="none" stroke="white" strokeOpacity="0.3" strokeWidth="2.5" />
                    <circle cx="18" cy="18" r="14" fill="none" stroke="white" strokeWidth="2.5"
                      strokeDasharray={`${(pf.uploadProgress || 0) * 0.88} 88`}
                      strokeLinecap="round" className="transition-[stroke-dasharray] duration-200" />
                  </svg>
                  <span className="absolute text-[10px] text-white font-medium">{pf.uploadProgress || 0}%</span>
                </div>
              )}
              {pf.uploadStatus === 'done' && (
                <div className="absolute inset-0 bg-black/30 rounded-lg flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                </div>
              )}
              {pf.uploadStatus === 'error' && (
                <div className="absolute inset-0 bg-red-500/40 rounded-lg flex items-center justify-center">
                  <X className="w-5 h-5 text-white" />
                </div>
              )}
              {/* Remove button — hide during upload */}
              {!uploading && (
                <button
                  onClick={() => removeFile(i)}
                  aria-label="Удалить файл"
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {recording ? (
        <div data-testid="chat-recording" className="flex items-center gap-3 px-4 py-3">
          <button data-testid="chat-recording-cancel" onClick={cancelRecording} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-red-500 transition-colors" title="Отменить">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-sm text-red-500 font-medium tabular-nums">{formatTime(recordingTime)}</span>
          </div>
          <button data-testid="chat-recording-send" onClick={stopRecording} className="p-2.5 rounded-full bg-primary-500 hover:bg-primary-600 text-white transition-colors" title="Отправить">
            <Send className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <div className="flex items-end gap-2 px-4 py-3" onPaste={handlePaste}>
          <button
            data-testid="chat-attach-btn" onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0 mb-0.5"
            title="Прикрепить файл"
            aria-label="Прикрепить файл"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input ref={fileInputRef} data-testid="chat-file-input" type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/*" />

          <div className="flex-1 relative">
            <div className="bg-gray-100 dark:bg-gray-700 rounded-2xl focus-within:ring-1 focus-within:ring-primary-500">
              <EditorContent
                editor={editor}
                data-testid="chat-input-textarea"
              />
            </div>
            <div ref={emojiPickerRef} className="absolute right-1 bottom-1">
              <button
                data-testid="chat-emoji-btn"
                onClick={() => setShowEmojiPicker(v => !v)}
                className="p-1.5 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                title="Эмодзи"
                aria-label="Выбрать эмодзи"
                type="button"
              >
                <Smile className="w-5 h-5" />
              </button>
              {showEmojiPicker && (
                <div className="absolute bottom-10 right-0 z-50 shadow-xl rounded-xl overflow-hidden">
                  <EmojiPicker
                    onEmojiClick={handleEmojiClick}
                    theme={Theme.AUTO}
                    width={320}
                    height={400}
                    searchPlaceHolder="Поиск эмодзи..."
                    previewConfig={{ showPreview: false }}
                    lazyLoadEmojis
                  />
                </div>
              )}
            </div>
          </div>

          {hasContent || pendingFiles.length > 0 ? (
            <button data-testid="chat-send-btn" onClick={handleSend} disabled={uploading} aria-label="Отправить сообщение" className="p-2.5 rounded-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white transition-colors flex-shrink-0 mb-0.5">
              {uploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
            </button>
          ) : (
            <button data-testid="chat-mic-btn" onClick={startRecording} aria-label="Голосовое сообщение" className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0 mb-0.5" title="Голосовое сообщение">
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

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

function normalizeWaveform(data: number[], targetLength: number): number[] {
  if (data.length === 0) return Array(targetLength).fill(0.3);
  const result: number[] = [];
  const step = data.length / targetLength;
  for (let i = 0; i < targetLength; i++) {
    const start = Math.floor(i * step);
    const end = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = start; j < end && j < data.length; j++) sum += data[j];
    result.push(sum / (end - start));
  }
  const max = Math.max(...result, 0.01);
  return result.map(v => v / max);
}
