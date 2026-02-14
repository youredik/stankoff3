import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Stankoff Portal - Корпоративный портал',
  description: 'Система управления цифровыми рабочими местами',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
  },
  manifest: '/manifest.json',
};

// Script to prevent theme flash
const themeScript = `
  (function() {
    try {
      const stored = localStorage.getItem('stankoff-theme');
      const theme = stored ? JSON.parse(stored).state?.theme : 'system';
      const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      if (isDark) {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[999] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium"
        >
          Перейти к основному содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
