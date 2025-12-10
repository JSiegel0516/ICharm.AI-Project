"use client";

import React from "react";
import NavigationIcons from "@/app/(frontpage)/_components/Header/NavigationIcons";
import Link from "next/link";

const Header: React.FC = () => {
  return (
    <>
      {/* Logo and Title - Top Left */}
      <div className="fixed top-6 left-8 z-50 flex items-center gap-4 leading-relaxed">
        <Link href="/" className="flex items-center gap-4">
          <img
            src="/images/icharmlogo.png"
            alt="IC Logo"
            className="h-10 w-10 rounded-lg"
          />
          <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-xl font-semibold text-transparent">
            iCHARM
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
