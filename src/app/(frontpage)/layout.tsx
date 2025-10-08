import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/app/globals.css';
import { AppStateProvider } from '@/context/HeaderContext';
import Header from '@/components/Header/Header';
import ChatBot from '@/components/Chat/ChatBot';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: {
    template: '%s | ICharm.AI',
    default: 'ICharm.AI - Climate Data Visualization',
  },
  description:
    'Advanced weather and climate data visualization platform with AI assistance',
  icons: {
    icon: '/favicon.ico',
  },
  keywords:
    'weather, climate, data visualization, AI, globe, temperature, precipitation',
  authors: [{ name: 'Your Team' }],
  creator: 'SCIL',
  publisher: 'SCIL',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.className} dark scroll-smooth`}>
      <body
        className={`min-h-screen w-full bg-white antialiased dark:bg-black`}
      >
        <AppStateProvider>
          <div className="flex min-h-screen flex-col">
            <Header />
            <main id="root" className="flex-1 overflow-y-auto">
              {children}
            </main>
            <div className="pointer-events-auto fixed right-0 top-0 z-20 h-full">
              <ChatBot />
            </div>
          </div>
        </AppStateProvider>
      </body>
    </html>
  );
}
