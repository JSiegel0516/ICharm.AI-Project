"use client";

import React from "react";
import { Settings, Info, MessageCircle, Camera } from "lucide-react";
import NavigationIcons from "./NavigationIcons";
import Link from "next/link";
import { HeaderProps } from "@/types";
import { useAppState } from "@/hooks/useAppState";

const Header: React.FC = () => {
  const {
    setShowSettings,
    setShowAbout,
    setShowChat,
    setCurrentDataset,
    showSettings,
    showAbout,
    showChat,
    currentDataset,
  } = useAppState();

  return (
    <>
      {/* Logo and Title - Top Left */}
      <div className="fixed top-6 left-8 z-50 flex items-center gap-4 leading-relaxed">
        <Link href="/" className="flex items-center gap-4">
          <img
            src="/images/4DVD.png"
            alt="IC Logo"
            className="h-10 w-10 rounded-lg"
          />
          <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-xl font-semibold text-transparent">
            iCharm
          </h1>
        </Link>
      </div>

      {/* Navigation Icons - Top Right */}
      <div className="fixed top-6 right-8 z-50">
        <NavigationIcons />
      </div>
    </>
  );
};

export default Header;
