import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '@/store/useAuthStore';

let socket: Socket | null = null;

function getWsUrl() {
  if (typeof window === 'undefined') {
    return process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001';
  }
  const isDev = window.location.hostname === 'localhost' && window.location.port === '3000';
  return isDev ? 'http://localhost:3001' : window.location.origin;
}

export function getSocket(): Socket | null {
  return socket;
}

export function initSocket(): Socket {
  if (socket) return socket;

  socket = io(getWsUrl(), {
    transports: ['websocket', 'polling'],
    auth: { token: useAuthStore.getState().accessToken },
  });

  return socket;
}

export function destroySocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
