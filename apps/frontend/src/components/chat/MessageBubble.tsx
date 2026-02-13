'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { format } from 'date-fns';
import { Check, CheckCheck, Reply, Copy, Pencil, Trash2, Pin, SmilePlus, Sparkles, Download, Play, X as XIcon } from 'lucide-react';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { VoicePlayer } from './VoicePlayer';
import type { ChatMessage, ChatMessageReaction } from '@/types';
import { useChatStore } from '@/store/useChatStore';
import { useAuthStore } from '@/store/useAuthStore';
import { useUserProfileStore } from '@/store/useUserProfileStore';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { getSignedUrl } from '@/lib/signedUrl';

const AI_BOT_EMAIL = 'ai-assistant@stankoff.ru';

interface MessageBubbleProps {
  message: ChatMessage;
  isOwn: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  onReply: () => void;
  conversationId: string;
  isRead?: boolean;
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

function ImagePreview({ fileKey, alt }: { fileKey: string; alt: string }) {
  const signedUrl = useSignedUrl(fileKey);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [fullscreen]);

  if (!signedUrl) {
    return <div className="rounded-lg w-[200px] h-[150px] bg-gray-100 dark:bg-gray-700 animate-pulse" />;
  }

  return (
    <>
      <img
        src={signedUrl}
        alt={alt}
        className="rounded-lg max-w-full max-h-[300px] object-contain cursor-pointer hover:opacity-90 transition-opacity"
        onClick={() => setFullscreen(true)}
        loading="lazy"
      />
      {fullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFullscreen(false)}>
          <button
            onClick={(e) => { e.stopPropagation(); setFullscreen(false); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            aria-label="Закрыть"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <img
            src={signedUrl}
            alt={alt}
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function VideoPreview({ fileKey, name }: { fileKey: string; name: string }) {
  const signedUrl = useSignedUrl(fileKey);
  const [fullscreen, setFullscreen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fullVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!fullscreen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [fullscreen]);

  if (!signedUrl) {
    return <div className="rounded-lg w-[260px] h-[180px] bg-gray-100 dark:bg-gray-700 animate-pulse" />;
  }

  return (
    <>
      <div className="relative rounded-lg overflow-hidden max-w-[320px] cursor-pointer group" onClick={() => setFullscreen(true)}>
        <video
          ref={videoRef}
          src={signedUrl}
          className="w-full max-h-[300px] object-contain bg-black rounded-lg"
          preload="metadata"
          muted
          playsInline
          onMouseEnter={() => { videoRef.current?.play(); setPlaying(true); }}
          onMouseLeave={() => { videoRef.current?.pause(); if (videoRef.current) videoRef.current.currentTime = 0; setPlaying(false); }}
        />
        {!playing && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/10 transition-colors">
            <div className="w-12 h-12 rounded-full bg-black/50 flex items-center justify-center backdrop-blur-sm">
              <Play className="w-6 h-6 text-white ml-0.5" />
            </div>
          </div>
        )}
        <div className="absolute bottom-2 left-2 text-[10px] text-white bg-black/50 px-1.5 py-0.5 rounded backdrop-blur-sm">
          {name}
        </div>
      </div>
      {fullscreen && (
        <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setFullscreen(false)}>
          <button
            onClick={(e) => { e.stopPropagation(); setFullscreen(false); }}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors z-10"
            aria-label="Закрыть"
          >
            <XIcon className="w-6 h-6" />
          </button>
          <video
            ref={fullVideoRef}
            src={signedUrl}
            controls
            autoPlay
            className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
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
  isRead,
}: MessageBubbleProps) {
  const [showMenu, setShowMenu] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [menuFlip, setMenuFlip] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuthStore();
  const { editMessage, deleteMessage, toggleReaction, pinMessage, unpinMessage } = useChatStore();
  const openProfile = useUserProfileStore((s) => s.openProfile);

  if (message.type === 'system') return <SystemMessage message={message} />;

  const isAiBot = message.author?.email === AI_BOT_EMAIL;
  const time = format(new Date(message.createdAt), 'HH:mm');
  const showAvatar = !isOwn && isLastInGroup;
  const showName = !isOwn && isFirstInGroup;
  const ownRadius = `${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-lg'} ${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-lg'} rounded-bl-2xl rounded-br-lg`;
  const otherRadius = `${isFirstInGroup ? 'rounded-tr-2xl' : 'rounded-tr-lg'} ${isFirstInGroup ? 'rounded-tl-2xl' : 'rounded-tl-lg'} rounded-br-2xl rounded-bl-lg`;

  // Flip context menu upward if it overflows the viewport
  useEffect(() => {
    if (!showMenu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    setMenuFlip(rect.bottom > window.innerHeight - 8);
  }, [showMenu]);

  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); setMenuFlip(false); setShowMenu(!showMenu); };
  const handleCopy = () => { navigator.clipboard.writeText((message.content || '').replace(/<[^>]*>/g, '')); setShowMenu(false); };
  const handleEdit = () => { setEditContent((message.content || '').replace(/<[^>]*>/g, '')); setEditing(true); setShowMenu(false); };
  const handleSaveEdit = async () => { if (editContent.trim()) await editMessage(message.conversationId, message.id, editContent); setEditing(false); };
  const handleDelete = async () => { await deleteMessage(message.conversationId, message.id); setShowMenu(false); };
  const handlePin = async () => { message.isPinned ? await unpinMessage(conversationId, message.id) : await pinMessage(conversationId, message.id); setShowMenu(false); };

  const scrollToReply = () => {
    if (!message.replyTo) return;
    const el = document.getElementById(`msg-${message.replyTo.id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('animate-highlight-msg');
      setTimeout(() => el.classList.remove('animate-highlight-msg'), 2000);
    }
  };

  // Extract first URL for link preview
  const textContent = (message.content || '').replace(/<[^>]*>/g, '');
  const firstUrl = message.type === 'text' ? textContent.match(URL_REGEX)?.[0] : undefined;

  // Render content — Tiptap mention tags have data-type="mention" with proper styling
  const renderContent = useCallback(() => {
    return message.content || '';
  }, [message.content]);

  const imageAttachments = message.attachments?.filter(a => a.mimeType.startsWith('image/')) || [];
  const videoAttachments = message.attachments?.filter(a => a.mimeType.startsWith('video/')) || [];
  const fileAttachments = message.attachments?.filter(a => !a.mimeType.startsWith('image/') && !a.mimeType.startsWith('video/')) || [];

  return (
    <div
      id={`msg-${message.id}`}
      data-testid="chat-message-bubble"
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isLastInGroup ? 'mb-2' : 'mb-0.5'} transition-all`}
    >
      {!isOwn && (
        <div className="w-8 flex-shrink-0 self-end mr-1.5">
          {showAvatar && message.author && (
            isAiBot ? (
              <div className="w-7 h-7 bg-gradient-to-br from-primary-400 to-violet-500 rounded-full flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5 text-white" />
              </div>
            ) : (
              <div className="cursor-pointer" onClick={() => message.author && openProfile(message.author as any)}>
                <UserAvatar firstName={message.author.firstName} lastName={message.author.lastName} avatar={message.author.avatar} userId={message.authorId} size="sm" clickable={false} />
              </div>
            )
          )}
        </div>
      )}

      <div data-testid="chat-message-content" className={`relative max-w-[65%] group ${isOwn ? 'mr-1' : ''}`} onContextMenu={handleContextMenu}>
        {message.replyTo && (
          <div onClick={scrollToReply} className={`mb-0.5 px-3 py-1.5 border-l-2 border-primary-400 cursor-pointer hover:opacity-80 transition-opacity ${isOwn ? 'bg-[#D8F6C6] dark:bg-[#1F3F2E] rounded-t-xl' : 'bg-gray-50 dark:bg-gray-700 rounded-t-xl'}`}>
            <span className="text-xs font-medium text-primary-600 dark:text-primary-400">{message.replyTo.author?.firstName}</span>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{(message.replyTo.content || '').replace(/<[^>]*>/g, '').substring(0, 60)}</p>
          </div>
        )}

        <div className={`relative px-3 py-1.5 after:content-[''] after:clear-both after:block ${isOwn ? `bg-[#EFFDDE] dark:bg-[#2B5278] ${ownRadius}` : `${isAiBot ? 'bg-violet-50 dark:bg-violet-900/20' : 'bg-white dark:bg-[#212121]'} ${otherRadius}`}`}>
          {message.isPinned && <Pin data-testid="chat-message-pin-icon" className="absolute -top-1 -right-1 w-3 h-3 text-primary-500 rotate-45" />}

          {showName && message.author && (
            <div
              className={`text-xs font-medium mb-0.5 ${isAiBot ? 'text-violet-600 dark:text-violet-400' : 'text-primary-600 dark:text-primary-400 cursor-pointer hover:underline'}`}
              onClick={!isAiBot ? () => openProfile(message.author as any) : undefined}
            >
              {isAiBot ? 'AI Ассистент' : `${message.author.firstName} ${message.author.lastName}`}
            </div>
          )}

          {message.type === 'voice' && message.voiceKey && (
            <VoicePlayer voiceKey={message.voiceKey} duration={message.voiceDuration || 0} waveform={message.voiceWaveform || []} />
          )}

          {imageAttachments.length > 0 && (
            <div className={`space-y-1.5 ${message.type === 'text' && message.content ? 'mb-1.5' : ''}`}>
              {imageAttachments.map(att => <ImagePreview key={att.id} fileKey={att.key} alt={att.name} />)}
            </div>
          )}

          {videoAttachments.length > 0 && (
            <div className={`space-y-1.5 ${message.type === 'text' && message.content ? 'mb-1.5' : ''}`}>
              {videoAttachments.map(att => <VideoPreview key={att.id} fileKey={att.key} name={att.name} />)}
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
                <div className="text-sm text-gray-900 dark:text-gray-100 break-words [&>p]:m-0 [&_[data-type=mention]]:text-primary-500 [&_[data-type=mention]]:font-medium" dangerouslySetInnerHTML={{ __html: renderContent() }} />
              )}
            </>
          )}

          {fileAttachments.length > 0 && (
            <div className="mt-1.5 space-y-1">
              {fileAttachments.map(att => (
                <button
                  key={att.id}
                  onClick={async () => {
                    const url = await getSignedUrl(att.key);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = att.name;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.click();
                  }}
                  className="flex items-center gap-2 text-xs text-primary-600 dark:text-primary-400 hover:underline cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="truncate">{att.name}</span>
                  <span className="text-gray-400 flex-shrink-0">{(att.size / 1024).toFixed(0)} KB</span>
                </button>
              ))}
            </div>
          )}

          {firstUrl && !editing && <LinkPreview url={firstUrl} />}

          <span className="float-right ml-2 mt-1 flex items-center gap-0.5">
            {message.isEdited && <span data-testid="chat-message-edited" className="text-[10px] text-gray-400 dark:text-gray-500 mr-0.5">ред.</span>}
            <span className={`text-[11px] ${isOwn ? 'text-green-600/60 dark:text-gray-400' : 'text-gray-400 dark:text-gray-500'}`}>{time}</span>
            {isOwn && (isRead
              ? <CheckCheck className="w-3.5 h-3.5 text-green-600/60 dark:text-blue-400" />
              : <Check className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
            )}
          </span>
        </div>

        <ReactionBar reactions={message.reactions || []} messageId={message.id} conversationId={conversationId} isOwn={isOwn} />

        {/* Invisible bridge to keep hover active when moving cursor toward action buttons */}
        <div className={`absolute top-0 h-10 ${isOwn ? '-left-14 w-14' : '-right-14 w-14'} hidden group-hover:block`} />

        {/* Hover actions: reply + reaction */}
        <div className={`absolute top-0 ${isOwn ? '-left-14' : '-right-14'} hidden group-hover:flex items-start pt-1 gap-0.5`}>
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
            <div data-testid="chat-context-menu" ref={menuRef} className={`absolute z-50 ${isOwn ? 'right-0' : 'left-0'} ${menuFlip ? 'bottom-full mb-1' : 'top-full mt-1'} bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]`}>
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
