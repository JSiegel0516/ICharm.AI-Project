'use client';

import React, { useState } from 'react';
import { MessageCircle, X } from 'lucide-react';
import { ChatBotProps } from '@/types';
import ChatPage from '../UI/ChatPage';

const ChatBot: React.FC<ChatBotProps> = ({ show, onClose, onToggle }) => {
  const [showFullPage, setShowFullPage] = useState(false);

  const handleOpenFullPage = () => {
    setShowFullPage(true);
    onClose(); // Close the floating indicator
  };

  const handleCloseFullPage = () => {
    setShowFullPage(false);
  };

  return (
    <>
      <div>
        {/* Full Page Chat */}
        <ChatPage show={showFullPage} onClose={handleCloseFullPage} />

        {/* Chat Toggle Button - Only show when chat panel is closed */}
        {!showFullPage && (
          <button
            id="chatbot"
            onClick={show ? onClose : onToggle || handleOpenFullPage}
            className={`fixed bottom-6 right-6 z-50 flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition-all duration-300 hover:scale-110 hover:shadow-xl ${
              show
                ? 'bg-gray-800 hover:bg-gray-700'
                : 'bg-gradient-to-br from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700'
            }`}
            aria-label={show ? 'Close chat' : 'Open chat'}
          >
            {show ? <X size={24} /> : <MessageCircle size={24} />}
          </button>
        )}
      </div>
    </>
  );
};

export default ChatBot;
