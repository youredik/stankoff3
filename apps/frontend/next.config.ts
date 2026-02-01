import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Настройки изображений
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.yandexcloud.net',
        pathname: '/**',
      },
    ],
  },

  // Переменные окружения для клиента
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001',
  },

  // TypeScript строгий режим
  typescript: {
    ignoreBuildErrors: false,
  },

  // Оптимизация продакшена
  output: 'standalone',
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
