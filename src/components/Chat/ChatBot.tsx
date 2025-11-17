"use client";

import React, { useState, useEffect } from "react";
import { MessageCircle, X } from "lucide-react";
import ChatPage from "@/components/ui/ChatPage";

// Remove ChatBotProps since we're managing state internally
const ChatBot: React.FC = () => {
  const [show, setShow] = useState(false);
  const [showFullPage, setShowFullPage] = useState(false);

  // Ensure the chat is collapsed on initial load
  useEffect(() => {
    setShow(false);
    setShowFullPage(false);
  }, []);

  const handleToggle = () => {
    setShow(!show);
  };

  const handleClose = () => {
    setShow(false);
  };

  const handleOpenFullPage = () => {
    setShowFullPage(true);
    setShow(false); // Close the floating indicator
  };

  const handleCloseFullPage = () => {
    setShowFullPage(false);
  };

  return (
    <>
      {/* Full Page Chat */}
      <ChatPage show={showFullPage} onClose={handleCloseFullPage} />

      {/* Chat Toggle Button - Only show when chat panel is closed */}
      {!showFullPage && (
        <button
          id="chatbot"
          onClick={show ? handleClose : handleOpenFullPage}
          className="text-muted-foreground bg-card/80 border-border hover:text-card-foreground hover:bg-muted-foreground fixed right-6 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full border shadow-xl transition-all duration-300 hover:scale-110 hover:shadow-2xl"
          aria-label={show ? "Close chat" : "Open chat"}
        >
          {show ? <X size={24} /> : <MessageCircle size={20} />}
        </button>
      )}
    </>
  );
};

export default ChatBot;
