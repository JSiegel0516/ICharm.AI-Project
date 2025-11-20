"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { MoonIcon } from "@/components/ui/moon";
import { SunMoonIcon } from "@/components/ui/sun-moon";
import { SunMediumIcon } from "@/components/ui/sun-medium";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Set system theme by default on first load
  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined" && !localStorage.getItem("theme")) {
      setTheme("system");
    }
  }, [setTheme]);

  const toggleTheme = () => {
    // Only toggle between light and dark
    setTheme(theme === "dark" ? "light" : "dark");
  };

  if (!mounted) {
    return (
      <Button
        className="link--color bg-rpd-surface dark:bg-rp-surface"
        variant="outline"
        size="icon"
        disabled
      >
        <SunMoonIcon />
      </Button>
    );
  }

  // Determine which icon to show based on current theme
  const getCurrentIcon = () => {
    if (theme === "system") {
      const systemDark = window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
      return systemDark ? <MoonIcon /> : <SunMediumIcon />;
    }
    return theme === "dark" ? <MoonIcon /> : <SunMediumIcon />;
  };

  return (
    <Button
      className="link--color bg-rpd-surface hover:text-rpd-love dark:bg-rp-surface dark:hover:text-rp-rose cursor-pointer"
      variant="outline"
      size="icon"
      onClick={toggleTheme}
      title="theme toggle"
      aria-label="Theme toggle"
    >
      {getCurrentIcon()}
      <span className="sr-only">Theme toggle</span>
    </Button>
  );
}
