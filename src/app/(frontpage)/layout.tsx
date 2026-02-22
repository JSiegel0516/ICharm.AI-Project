import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { AppStateProvider, DatasetProvider } from "@/context/dataset-context";
import Header from "@/app/(frontpage)/_components/header/Header";
import ChatBot from "@/components/Chat/ChatBot";
import { ThemeProvider } from "@/components/theme-provider";
import { SettingsProvider } from "@/context/settings-context";

import "@/app/globals.css";
import { SidebarProvider } from "@/context/sidebar-context";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    template: "%s | iCHARM",
    default: "iCHARM - Climate Data Visualization",
  },
  description:
    "Advanced weather and climate data visualization platform with AI assistance",
  icons: {
    icon: "/favicon.ico",
  },
  keywords:
    "weather, climate, data visualization, AI, globe, temperature, precipitation",
  authors: [{ name: "SCIL" }],
  creator: "SCIL",
  publisher: "SCIL",
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
        <DatasetProvider>
          <SidebarProvider>
            <SettingsProvider>
              <div className="flex min-h-screen flex-col">
                <Header />
                <main id="root" className="flex-1 overflow-y-auto">
                  {children}
                </main>
                <div className="pointer-events-auto fixed top-0 right-0 z-20 h-full">
                  <ChatBot />
                </div>
              </div>
            </SettingsProvider>
          </SidebarProvider>
        </DatasetProvider>
      </body>
    </html>
  );
}
