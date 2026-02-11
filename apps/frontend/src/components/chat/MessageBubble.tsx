'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Reply, Copy, Pencil, Trash2, Pin, SmilePlus } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { VoicePlayer } from './VoicePlayer';
import type { ChatMessage, ChatMessageReaction } from '@/types';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onReply: () => void;
  conversationId: string;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];
const URL_REGEX = /https?:\/\/[^\s<]+/g;


function SystemMessage({ message }: { message: ChatMessage }) {
  let text = '';
  try {
    const data = JSON.parse(message.content || '{}');
    switch (data.action) {
      case 'participants_added': text = 'Добавлены новые участники'; break;
      case 'participant_removed': text = 'Участник удалён из чата'; break;
      case 'message_pinned': text = 'Сообщение закреплено'; break;
      case 'message_unpinned': text = 'Сообщение откреплено'; break;
      default: text = message.content || '';
    }
  } catch {
    text = message.content || '';
  }

  return (
    <div data-testid="chat-system-message" className="flex justify-center my-1">
      <span className="text-xs bg-black/5 dark:bg-white/10 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full">
        {text}
      </span>
    </div>
  );
}

function ImagePreview({ src, alt }: { src: string; alt: string }) {
  const [fullscreen, setFullscreen] = useState(false);
  return (
    <>
      <img
        src={src}
        alt={alt}
        className="rounded-lg max-w-full max-h-[300px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setFullscreen(true)}
        loading="lazy"
      />
      {fullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={() => setFullscreen(false)}>
          <img src={src} alt={alt} className="max-w-full max-h-full object-contain" />
        </div>
      )}
    </>
  );
}

function LinkPreview({ url }: { url: string }) {
  const [og, setOg] = useState<{ title?: string; description?: string; image?: string; siteName?: string } | null>(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/og-preview?url=${encodeURIComponent(url)}`)
      .then(r => r.json())
      .then(data => { if (data.title) setOg(data); })
      .catch(() => {});
  }, [url]);

  if (!og) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block mt-1.5 border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      {og.image && <img src={og.image} alt="" className="w-full h-32 object-cover" loading="lazy" />}
      <div className="px-3 py-2">
        {og.siteName && <p className="text-[10px] text-primary-500 uppercase tracking-wide">{og.siteName}</p>}
        <p className="text-xs font-medium text-gray-900 dark:text-gray-100 line-clamp-2">{og.title}</p>
        {og.description && <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{og.description}</p>}
      </div>
    </a>
  );
}

function ReactionBar({ reactions, messageId, conversationId, isOwn }: {
  reactions: ChatMessageReaction[];
  messageId: string;
  conversationId: string;
  isOwn: boolean;
}) {
  const { user } = useAuthStore();
  const { toggleReaction } = useChatStore();
  if (!reactions || reactions.length === 0) return null;

  return (
    <div data-testid="chat-reaction-bar" className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : 'justify-start'}`}>
      {reactions.map(r => {
        const isMine = user?.id ? r.userIds.includes(user.id) : false;
        return (
          <button
            key={r.emoji}
            data-testid="chat-reaction"
            onClick={() => toggleReaction(conversationId, messageId, r.emoji)}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs transition-colors ${
              isMine
                ? 'bg-primary-100 dark:bg-primary-900/30 border border-primary-300 dark:border-primary-700'
                : 'bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            <span>{r.emoji}</span>
            <span className="text-[10px] text-gray-600 dark:text-gray-400">{r.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export function MessageBubble({
  message,
  isOwn,
  isFirstInGroup,
  isLastInGroup,
  onReply,
  conversationId,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { editMessage, deleteMessage, toggleReaction, pinMessage, unpinMessage } = useChatStore();

  if (message.type === 'system') return <SystemMessage message={message} />;

  const time = format(new Date(message.createdAt), 'HH:mm');
  const showAvatar = !isOwn && isLastInGroup;
  const showName = !isOwn && isFirstInGroup;
  const ownRadius = `${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-lg'} ${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-lg'} rounded-bl-2xl rounded-br-lg`;
  const otherRadius = `${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-lg'} ${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-lg'} rounded-br-2xl rounded-bl-lg`;

  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); setShowMenu(!showMenu); };
  const handleCopy = () => { navigator.clipboard.writeText((message.content || '').replace(/<[^>]*>/g, '')); setShowMenu(false); };
  const handleEdit = () => { setEditContent((message.content || '').replace(/<[^>]*>/g, '')); setEditing(true); setShowMenu(false); };
  const handleSaveEdit = async () => { if (editContent.trim()) await editMessage(message.conversationId, message.id, editContent); setEditing(false); };
  const handleDelete = async () => { await deleteMessage(message.conversationId, message.id); setShowMenu(false); };
  const handlePin = async () => { message.isPinned ? await unpinMessage(conversationId, message.id) : await pinMessage(conversationId, message.id); setShowMenu(false); };

  // Extract first URL for link preview
  const textContent = (message.content || '').replace(/<[^>]*>/g, '');
  const firstUrl = message.type === 'text' ? textContent.match(URL_REGEX)?.[0] : undefined;

  // Render content with highlighted @mentions
  const renderContent = useCallback(() => {
    if (!message.content) return '';
    let html = message.content;
    if (message.mentionedUserIds?.length > 0) {
      html = html.replace(/@(\S+)/g, '<span class="text-primary-500 font-medium">@$1</span>');
    }
    return html;
  }, [message.content, message.mentionedUserIds]);

  const imageAttachments = message.attachments?.filter(a => a.mimeType.startsWith('image/')) || [];
  const fileAttachments = message.attachments?.filter(a => !a.mimeType.startsWith('image/')) || [];

  return (
    <div
      id={`msg-${message.id}`}
      data-testid="chat-message-bubble"
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-2' : 'mb-0.5'} transition-all`}
    >
      {!isOwn && (
        <div className="w-8 flex-shrink-0 self-end mr-1.5">
          {showAvatar && message.author && (
            <UserAvatar firstName={message.author.firstName} lastName={message.author.lastName} userId={message.authorId} size="sm" />
          )}
        </div>
      )}

      <div data-testid="chat-message-content" className={`relative max-w-[65%] group ${isOwn ? 'mr-1' : ''}`} onContextMenu={handleContextMenu}>
        {message.replyTo && (
          <div className={`mb-0.5 px-3 py-1.5 border-l-2 border-primary-400 ${isOwn ? 'bg-[#D8F6C6] dark:bg-[#1F3F2E] rounded-t-xl' : 'bg-gray-50 dark:bg-gray-700 rounded-t-xl'}`}>
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{message.replyTo.author?.firstName}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{(message.replyTo.content || '').replace(/<[^>]*>/g, '').substring(0, 60)}</p>
          </div>
        )}

        <div className={`relative px-3 py-1.5 ${isOwn ? `bg-[#EFFDDE] dark:bg-[#2B5278] ${ownRadius}` : `bg-white dark:bg-[#212121] ${otherRadius}`}`}>
          {message.isPinned && <Pin data-testid="chat-message-pin-icon" className="absolute -top-1 -right-1 w-3 h-3 text-primary-500 rotate-45" />}

          {showName && message.author && (
            <div className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-0.5">
              {message.author.firstName} {message.author.lastName}
            </div>
          )}

          {message.type === 'voice' && message.voiceKey && (
            <VoicePlayer voiceKey={message.voiceKey} duration={message.voiceDuration || 0} waveform={message.voiceWaveform || []} />
          )}

          {imageAttachments.length > 0 && (
            <div className={`space-y-1.5 ${message.type === 'text' && message.content ? 'mb-1.5' : ''}`}>
              {imageAttachments.map(att => <ImagePreview key={att.id} src={`/api/files/${att.key}`} alt={att.name} />)}
            </div>
          )}

          {message.type === 'text' && (
            <>
              {editing ? (
                <div className="flex items-center gap-2">
                  <input data-testid="chat-edit-input" type="text" value={editContent} onChange={e => setEditContent(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(false); }} className="flex-1 bg-transparent border-b border-primary-400 outline-none text-sm py-0.5" autoFocus />
                  <button onClick={handleSaveEdit} className="text-xs text-primary-500 hover:text-primary-600">OK</button>
                </div>
              ) : (
                <div className="text-sm text-gray-900 dark:text-gray-100 break-words [&>p]:m-0" dangerouslySetInnerHTML={{ __html: renderContent() }} />
              )}
            </>
          )}

          {fileAttachments.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {fileAttachments.map(att => (
                <a key={att.id} href={`/api/files/${att.key}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:underline">
                  <span className="truncate">{att.name}</span>
                  <span className="text-gray-400 flex-shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                </a>
              ))}
            </div>
          )}

          {firstUrl && !editing && <LinkPreview url={firstUrl} />}

          <span className="float-right ml-2 mt-1 flex items-center gap-0.5">
            {message.isEdited && <span data-testid="chat-message-edited" className="text-[10px] text-gray-400 dark:text-gray-500 mr-0.5">ред.</span>}
            <span className={`text-[11px] ${isOwn ? 'text-green-600/60 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>{time}</span>
            {isOwn && <CheckCheck className="w-3.5 h-3.5 text-green-600/60 dark:text-blue-400" />}
          </span>
        </div>

        <ReactionBar reactions={message.reactions || []} messageId={message.id} conversationId={conversationId} isOwn={isOwn} />

        {/* Hover actions: reply + reaction */}
        <div className={`absolute top-0 ${isOwn ? '-left-16' : '-right-16'} hidden group-hover:flex items-start pt-1 gap-0.5`}>
          <button data-testid="chat-hover-reply" onClick={onReply} className="p-1 rounded-full bg-white dark:bg-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600" title="Ответить">
            <Reply className="w-3.5 h-3.5 text-gray-500" />
          </button>
          <button data-testid="chat-hover-reaction" onClick={() => setShowReactions(!showReactions)} className="p-1 rounded-full bg-white dark:bg-gray-700 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600" title="Реакция">
            <SmilePlus className="w-3.5 h-3.5 text-gray-500" />
          </button>
        </div>

        {/* Quick reactions picker */}
        {showReactions && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowReactions(false)} />
            <div data-testid="chat-quick-reactions" className={`absolute z-50 ${isOwn ? 'right-0' : 'left-0'} -top-8 flex gap-0.5 bg-white dark:bg-gray-800 rounded-full shadow-xl border border-gray-200 dark:border-gray-700 px-1.5 py-1`}>
              {QUICK_REACTIONS.map(emoji => (
                <button key={emoji} onClick={() => { toggleReaction(conversationId, message.id, emoji); setShowReactions(false); }} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-base">
                  {emoji}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Context menu */}
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div data-testid="chat-context-menu" ref={menuRef} className={`absolute z-50 ${isOwn ? 'right-0' : 'left-0'} top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]`}>
              <button data-testid="chat-ctx-reply" onClick={() => { onReply(); setShowMenu(false); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Reply className="w-4 h-4" /> Ответить
              </button>
              <button data-testid="chat-ctx-copy" onClick={handleCopy} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Copy className="w-4 h-4" /> Копировать
              </button>
              <button data-testid="chat-ctx-pin" onClick={handlePin} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                <Pin className="w-4 h-4" /> {message.isPinned ? 'Открепить' : 'Закрепить'}
              </button>
              {isOwn && message.type === 'text' && (
                <button data-testid="chat-ctx-edit" onClick={handleEdit} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">
                  <Pencil className="w-4 h-4" /> Редактировать
                </button>
              )}
              {isOwn && (
                <button data-testid="chat-ctx-delete" onClick={handleDelete} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-50 dark:hover:bg-gray-700">
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
