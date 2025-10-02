'use client';

import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';
import ChatPage from '../UI/ChatPage';

// Remove ChatBotProps since we're managing state internally
const ChatBot: React.FC = () => {
  const [show, setShow] = useState(false);
  const [showFullPage, setShowFullPage] = useState(false);

  // Load state from localStorage on component mount
  useEffect(() => {
    const savedState = localStorage.getItem('chatbot-state');
    if (savedState) {
      const { show: savedShow, showFullPage: savedFullPage } =
        JSON.parse(savedState);
      setShow(savedShow);
      setShowFullPage(savedFullPage);
    }
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(
      'chatbot-state',
      JSON.stringify({ show, showFullPage })
    );
  }, [show, showFullPage]);

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
          className={`fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl ${
            show
              ? 'bg-gray-800 hover:bg-gray-700'
              : 'bg-slate-800 hover:bg-slate-700'
          }`}
          aria-label={show ? 'Close chat' : 'Open chat'}
        >
          {show ? <X size={24} /> : <MessageCircle size={24} />}
        </button>
      )}
    </>
  );
};

export default ChatBot;
