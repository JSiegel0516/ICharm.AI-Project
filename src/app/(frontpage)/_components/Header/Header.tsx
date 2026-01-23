"use client";

import React from "react";
import NavigationIcons from "@/app/(frontpage)/_components/Header/NavigationIcons";
import Link from "next/link";

const Header: React.FC = () => {
  return (
    <>
      {/* Logo and Title - Top Left */}
      <div className="absolute top-3.75 left-4 z-50 flex items-center gap-4 leading-relaxed transition-all duration-150 lg:top-8 lg:left-10">
        <Link href="/" className="flex items-center gap-3 lg:gap-4">
          <img
            src="/images/icharmlogo.png"
            alt="IC Logo"
            className="h-6 w-6 rounded-lg lg:h-10 lg:w-10"
          />
          <h1 className="bg-linear-to-r from-red-400 via-green-400 to-blue-400 bg-clip-text text-base font-semibold text-transparent lg:text-xl">
            iCHARM
          </h1>
        </Link>
      </div>

      {/* Navigation Icons - Top Right */}
      <div className="absolute top-2 right-4 z-50 transition-all duration-200 lg:top-8 lg:right-10">
        <NavigationIcons />
      </div>
    </>
  );
};

export default Header;
