"use client";

import React from "react";
import { Search } from "lucide-react";

type ChatSearchButtonProps = {
  onClick?: () => void;
};

const ChatSearchButton: React.FC<ChatSearchButtonProps> = ({ onClick }) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-700/50 bg-neutral-800/80 text-gray-100 transition hover:border-gray-500 hover:bg-neutral-700"
      aria-label="Open location search"
    >
      <Search size={16} />
    </button>
  );
};

export default ChatSearchButton;
