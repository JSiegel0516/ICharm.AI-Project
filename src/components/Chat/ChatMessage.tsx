import React from 'react';
import { ChatMessageProps } from '@/types';

const ChatMessageBot: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.type === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-blue-600 text-white'
            : 'border border-gray-200 bg-white text-gray-800'
        }`}
      >
        <p className="text-sm leading-relaxed">{message.message}</p>
        <p
          className={`mt-1 text-xs ${isUser ? 'text-blue-100' : 'text-gray-500'}`}
        >
          {message.timestamp.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
};

export default ChatMessageBot;
