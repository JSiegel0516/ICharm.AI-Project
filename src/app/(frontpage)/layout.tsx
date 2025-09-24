import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/app/globals.css';
import { AppStateProvider } from '@/app/context/HeaderContext';
import Header from '@/components/Header/Header';

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
    <html
      lang="en"
      className={`${inter.className} dark overflow-hidden scroll-smooth`}
    >
      <body
        className={`h-screen bg-gradient-to-br from-black via-gray-900 to-black antialiased`}
      >
        <AppStateProvider>
          <div className="flex h-full flex-col lg:px-6 lg:py-4">
            <main id="root" className="flex h-full flex-col overflow-hidden">
              <Header />
              {children}
            </main>
          </div>
        </AppStateProvider>
      </body>
    </html>
  );
}
