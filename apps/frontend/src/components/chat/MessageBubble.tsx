'use client';

import { useState, useRef } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Reply, Copy, Pencil, Trash2 } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { VoicePlayer } from './VoicePlayer';
import type { ChatMessage } from '@/types';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onReply: () => void;
}

// Telegram-style tail SVG
function BubbleTail({ isOwn }: { isOwn: boolean }) {
  if (isOwn) {
    return (
      <svg
        className="absolute -right-[6px] bottom-0 text-[#EFFDDE] dark:text-[#2B5278]"
        width="9"
        height="17"
        viewBox="0 0 9 17"
      >
        <path
          d="M0 17V0C0 0 1 8 9 17H0Z"
          fill="currentColor"
        />
      </svg>
    );
  }
  return (
    <svg
      className="absolute -left-[6px] bottom-0 text-white dark:text-[#212121]"
      width="9"
      height="17"
      viewBox="0 0 9 17"
    >
      <path
        d="M9 17V0C9 0 8 8 0 17H9Z"
        fill="currentColor"
      />
    </svg>
  );
}

function SystemMessage({ message }: { message: ChatMessage }) {
  let text = '';
  try {
    const data = JSON.parse(message.content || '{}');
    switch (data.action) {
      case 'participants_added':
        text = 'Добавлены новые участники';
        break;
      case 'participant_removed':
        text = 'Участник удалён из чата';
        break;
      default:
        text = message.content || '';
    }
  } catch {
    text = message.content || '';
  }

  return (
    <div className="flex justify-center my-1">
      <span className="text-xs bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full">
        {text}
      </span>
    </div>
  );
}

export function MessageBubble({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  onReply,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { editMessage, deleteMessage } = useChatStore();

  if (message.type === 'system') {
    return <SystemMessage message={message} />;
  }

  const time = format(new Date(message.createdAt), 'HH:mm');
  const showAvatar = !isOwn && isLastInGroup;
  const showName = !isOwn && isFirstInGroup;
  const showTail = isLastInGroup;

  // Rounded corners - Telegram style
  const ownRadius = `${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-lg'} ${
    isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-lg'
  } rounded-bl-2xl ${showTail ? 'rounded-br-sm' : 'rounded-br-lg'}`;

  const otherRadius = `${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-lg'} ${
    isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-lg'
  } rounded-br-2xl ${showTail ? 'rounded-bl-sm' : 'rounded-bl-lg'}`;

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(!showMenu);
  };

  const handleCopy = () => {
    const text = (message.content || '').replace(/<[^>]*>/g, '');
    navigator.clipboard.writeText(text);
    setShowMenu(false);
  };

  const handleEdit = () => {
    setEditContent((message.content || '').replace(/<[^>]*>/g, ''));
    setEditing(true);
    setShowMenu(false);
  };

  const handleSaveEdit = async () => {
    if (editContent.trim()) {
      await editMessage(message.conversationId, message.id, editContent);
    }
    setEditing(false);
  };

  const handleDelete = async () => {
    await deleteMessage(message.conversationId, message.id);
    setShowMenu(false);
  };

  return (
    <div
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${
        isLastInGroup ? 'mb-2' : 'mb-0.5'
      }`}
    >
      {/* Avatar placeholder for alignment */}
      {!isOwn && (
        <div className="w-8 flex-shrink-0 self-end mr-1.5">
          {showAvatar && message.author && (
            <UserAvatar
              firstName={message.author.firstName}
              lastName={message.author.lastName}
              userId={message.authorId}
              size="sm"
            />
          )}
        </div>
      )}

      <div
        className={`relative max-w-[65%] group ${isOwn ? 'mr-1' : ''}`}
        onContextMenu={handleContextMenu}
      >
        {/* Reply quote */}
        {message.replyTo && (
          <div
            className={`mb-0.5 px-3 py-1.5 border-l-2 border-primary-400 ${
              isOwn
                ? 'bg-[#D8F6C6] dark:bg-[#1F3F2E] rounded-t-xl'
                : 'bg-gray-50 dark:bg-gray-700 rounded-t-xl'
            }`}
          >
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
              {message.replyTo.author?.firstName}
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {(message.replyTo.content || '').replace(/<[^>]*>/g, '').substring(0, 60)}
            </p>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`relative px-3 py-1.5 ${
            isOwn
              ? `bg-[#EFFDDE] dark:bg-[#2B5278] ${ownRadius}`
              : `bg-white dark:bg-[#212121] ${otherRadius}`
          }`}
        >
          {/* Author name in group chats */}
          {showName && message.author && (
            <div className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-0.5">
              {message.author.firstName} {message.author.lastName}
            </div>
          )}

          {/* Voice message */}
          {message.type === 'voice' && message.voiceKey && (
            <VoicePlayer
              voiceKey={message.voiceKey}
              duration={message.voiceDuration || 0}
              waveform={message.voiceWaveform || []}
            />
          )}

          {/* Text content */}
          {message.type === 'text' && (
            <>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') setEditing(false);
                    }}
                    className="flex-1 bg-transparent border-b border-primary-400 outline-none text-sm py-0.5"
                    autoFocus
                  />
                  <button
                    onClick={handleSaveEdit}
                    className="text-xs text-primary-500 hover:text-primary-600"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <div
                  className="text-sm text-gray-900 dark:text-gray-100 break-words [&>p]:m-0"
                  dangerouslySetInnerHTML={{ __html: message.content || '' }}
                />
              )}
            </>
          )}

          {/* Attachments */}
          {message.attachments?.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {message.attachments.map((att) => (
                <a
                  key={att.id}
                  href={`/api/files/${att.key}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                >
                  <span className="truncate">{att.name}</span>
                  <span className="text-gray-400 flex-shrink-0">
                    {(att.size / 1024).toFixed(0)} KB
                  </span>
                </a>
              ))}
            </div>
          )}

          {/* Time + checkmarks (Telegram style: float right inside bubble) */}
          <span className="float-right ml-2 mt-1 flex items-center gap-0.5">
            {message.isEdited && (
              <span className="text-[10px] text-gray-400 dark:text-gray-500 mr-0.5">ред.</span>
            )}
            <span
              className={`text-[11px] ${
                isOwn
                  ? 'text-green-600/60 dark:text-gray-400'
                  : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              {time}
            </span>
            {isOwn && (
              <CheckCheck className="w-3.5 h-3.5 text-green-600/60 dark:text-blue-400" />
            )}
          </span>
        </div>

        {/* Tail */}
        {showTail && <BubbleTail isOwn={isOwn} />}

        {/* Hover actions */}
        <div
          className={`absolute top-0 ${
            isOwn ? '-left-8' : '-right-8'
          } hidden group-hover:flex items-start pt-1`}
        >
          <button
            onClick={onReply}
            className="p-1 rounded-full bg-white dark:bg-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600"
            title="Ответить"
          >
            <Reply className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        {/* Context menu */}
        {showMenu && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setShowMenu(false)}
            />
            <div
              ref={menuRef}
              className={`absolute z-50 ${
                isOwn ? 'right-0' : 'left-0'
              } top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]`}
            >
              <button
                onClick={() => { onReply(); setShowMenu(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Reply className="w-4 h-4" /> Ответить
              </button>
              <button
                onClick={handleCopy}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <Copy className="w-4 h-4" /> Копировать
              </button>
              {isOwn && message.type === 'text' && (
                <button
                  onClick={handleEdit}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Pencil className="w-4 h-4" /> Редактировать
                </button>
              )}
              {isOwn && (
                <button
                  onClick={handleDelete}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <Trash2 className="w-4 h-4" /> Удалить
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
