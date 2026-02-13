import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '@/store/useAuthStore';

// В браузере используем /api/ для работы через rewrites
// На сервере (SSR) используем полный URL backend'а
const API_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001')
  : '/api';

const REQUEST_TIMEOUT = 30_000; // 30 секунд на обычные запросы

export const apiClient = axios.create({
  baseURL: API_URL,
  timeout: REQUEST_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Отправлять cookies (для refresh token)
});

// Функции для работы с токенами — всегда берём из store напрямую
const getAccessToken = () => {
  if (typeof window === 'undefined') return null;
  return useAuthStore.getState().accessToken;
};

const refreshTokens = async () => {
  if (typeof window === 'undefined') return false;
  return useAuthStore.getState().refreshTokens();
};

// Request interceptor — добавляем токен
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Очередь запросов, ожидающих refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Response interceptor — обновляем токен при 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Если 401 и ещё не пытались обновить токен
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      // Не пытаемся обновить токен для auth эндпоинтов
      !originalRequest.url?.includes('/auth/')
    ) {
      if (isRefreshing) {
        // Уже идёт refresh — ставим запрос в очередь
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(() => {
            const token = getAccessToken();
            if (token) {
              originalRequest.headers.Authorization = `Bearer ${token}`;
            }
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const success = await refreshTokens();
        if (success) {
          const token = getAccessToken();
          processQueue(null, token);
          if (token) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return apiClient(originalRequest);
        }
        processQueue(new Error('Refresh failed'), null);
        return Promise.reject(error);
      } catch (refreshError) {
        processQueue(refreshError as Error, null);
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  },
);
