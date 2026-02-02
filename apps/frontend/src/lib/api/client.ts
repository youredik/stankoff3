import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';

// В браузере используем /api/ для работы через rewrites
// На сервере (SSR) используем полный URL backend'а
const API_URL = typeof window === 'undefined'
  ? (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001')
  : '/api';

export const apiClient = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Отправлять cookies (для refresh token)
});

// Функция для получения токена из store (будет установлена позже)
let getAccessToken: (() => string | null) | null = null;
let refreshTokens: (() => Promise<boolean>) | null = null;

export const setAuthInterceptors = (
  tokenGetter: () => string | null,
  tokenRefresher: () => Promise<boolean>,
) => {
  getAccessToken = tokenGetter;
  refreshTokens = tokenRefresher;
};

// Request interceptor - добавляем токен
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAccessToken?.();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - обновляем токен при 401
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
      refreshTokens &&
      // Не пытаемся обновить токен для auth эндпоинтов
      !originalRequest.url?.includes('/auth/')
    ) {
      originalRequest._retry = true;

      const success = await refreshTokens();
      if (success) {
        // Повторяем оригинальный запрос с новым токеном
        const token = getAccessToken?.();
        if (token) {
          originalRequest.headers.Authorization = `Bearer ${token}`;
        }
        return apiClient(originalRequest);
      }
    }

    return Promise.reject(error);
  },
);
