'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Paperclip, X, Mic, FileText, Smile } from 'lucide-react';
import EmojiPicker, { EmojiClickData, Theme } from 'emoji-picker-react';
import type { ChatMessage, ChatMessageAttachment } from '@/types';
import { getSocket } from '@/lib/socket';
import { apiClient } from '@/lib/api/client';

interface ChatInputProps {
  onSend: (content: string, attachments?: ChatMessageAttachment[]) => void;
  onSendVoice: (voiceKey: string, duration: number, waveform: number[]) => void;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
  conversationId: string;
  isAiChat?: boolean;
}

interface PendingFile {
  file: File;
  preview?: string;
}

export function ChatInput({
  onSend,
  onSendVoice,
  replyTo,
  onCancelReply,
  conversationId,
  isAiChat,
}: ChatInputProps) {
  const [content, setContent] = useState('');
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0';
      el.style.height = Math.min(el.scrollHeight, 200) + 'px';
    }
  }, [content]);

  // Focus on mount and when replying
  useEffect(() => {
    textareaRef.current?.focus();
  }, [replyTo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
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
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newContent = content.slice(0, start) + emojiData.emoji + content.slice(end);
      setContent(newContent);
      // Set cursor position after emoji
      requestAnimationFrame(() => {
        const pos = start + emojiData.emoji.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      });
    } else {
      setContent(prev => prev + emojiData.emoji);
    }
  }, [content]);

  const uploadFile = async (file: File | Blob, filename?: string): Promise<{ key: string } | null> => {
    const formData = new FormData();
    formData.append('file', file, filename || (file instanceof File ? file.name : 'file'));
    try {
      const res = await apiClient.post<{ key: string; url: string }>('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return { key: res.data.key };
    } catch {
      return null;
    }
  };

  const handleSend = useCallback(async () => {
    const hasContent = content.trim().length > 0;
    const hasFiles = pendingFiles.length > 0;
    if (!hasContent && !hasFiles) return;

    let attachments: ChatMessageAttachment[] = [];

    if (hasFiles) {
      setUploading(true);
      try {
        const results = await Promise.all(
          pendingFiles.map(async (pf) => {
            const res = await uploadFile(pf.file);
            if (!res) return null;
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

    onSend(content, attachments.length > 0 ? attachments : undefined);
    setContent('');
    pendingFiles.forEach(pf => { if (pf.preview) URL.revokeObjectURL(pf.preview); });
    setPendingFiles([]);
    textareaRef.current?.focus();
  }, [content, pendingFiles, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  // Emit typing indicator via socket
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setContent(e.target.value);

      if (typingTimeoutRef.current) return;
      const socket = getSocket();
      if (socket?.connected) {
        socket.emit('chat:typing', { conversationId });
      }
      typingTimeoutRef.current = setTimeout(() => {
        typingTimeoutRef.current = null;
      }, 2000);
    },
    [conversationId],
  );

  // ─── File handling ─────────────────────────────────────────

  const addFiles = useCallback((files: FileList | File[]) => {
    const newPending: PendingFile[] = Array.from(files).map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
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

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) imageFiles.push(file);
      }
    }
    if (imageFiles.length > 0) {
      e.preventDefault();
      addFiles(imageFiles);
    }
  }, [addFiles]);

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
            <div key={i} className="relative flex-shrink-0 group">
              {pf.preview ? (
                <img src={pf.preview} alt={pf.file.name} className="w-16 h-16 object-cover rounded-lg" />
              ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-100 dark:bg-gray-700 flex flex-col items-center justify-center">
                  <FileText className="w-5 h-5 text-gray-400" />
                  <span className="text-[9px] text-gray-400 truncate max-w-[56px] mt-0.5">
                    {pf.file.name.split('.').pop()}
                  </span>
                </div>
              )}
              <button
                onClick={() => removeFile(i)}
                aria-label="Удалить файл"
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
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
        <div className="flex items-end gap-2 px-4 py-3">
          <button
            data-testid="chat-attach-btn" onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0 mb-0.5"
            title="Прикрепить файл"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input ref={fileInputRef} data-testid="chat-file-input" type="file" multiple className="hidden" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,audio/*" />

          <div className="flex-1 relative">
            <textarea
              ref={textareaRef} data-testid="chat-input-textarea"
              value={content}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isAiChat ? 'Спросите AI ассистента...' : 'Сообщение...'}
              rows={1}
              className="w-full resize-none bg-gray-100 dark:bg-gray-700 rounded-2xl px-4 py-2.5 pr-10 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-primary-500 max-h-[200px]"
            />
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

          {content.trim() || pendingFiles.length > 0 ? (
            <button data-testid="chat-send-btn" onClick={handleSend} disabled={uploading} aria-label="Отправить сообщение" className="p-2.5 rounded-full bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white transition-colors flex-shrink-0 mb-0.5">
              <Send className="w-5 h-5" />
            </button>
          ) : (
            <button data-testid="chat-mic-btn" onClick={startRecording} className="p-2.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 transition-colors flex-shrink-0 mb-0.5" title="Голосовое сообщение">
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
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
