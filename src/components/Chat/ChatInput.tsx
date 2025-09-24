'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { ChatInputProps } from '@/types';

const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  disabled = false,
  placeholder = 'Ask me about climate data...',
}) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message.trim());
      setMessage('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);

    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-gray-200 bg-white p-4 dark:border-gray-600 dark:bg-gray-800"
    >
      <div className="flex items-end gap-3">
        {/* Attachment button (future feature) */}
        <button
          type="button"
          className="p-2 text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
          disabled
        >
          <Paperclip size={20} />
        </button>

        {/* Message input */}
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={handleInputChange}
            onKeyPress={handleKeyPress}
            placeholder={placeholder}
            disabled={disabled}
            className="max-h-[120px] min-h-[44px] w-full resize-none rounded-2xl border border-gray-300 bg-white px-4 py-3 pr-12 text-gray-900 placeholder-gray-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            rows={1}
          />

          {/* Character counter for long messages */}
          {message.length > 200 && (
            <div className="absolute -top-6 right-0 text-xs text-gray-500 dark:text-gray-400">
              {message.length}/1000
            </div>
          )}
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={!message.trim() || disabled}
          className="flex h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-blue-600 p-3 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Typing indicator area */}
      <div className="mt-2 flex h-4 items-center">
        {disabled && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <div className="flex gap-1">
              <div
                className="h-1 w-1 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: '0ms' }}
              ></div>
              <div
                className="h-1 w-1 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: '150ms' }}
              ></div>
              <div
                className="h-1 w-1 animate-bounce rounded-full bg-gray-400"
                style={{ animationDelay: '300ms' }}
              ></div>
            </div>
            Assistant is thinking...
          </div>
        )}
      </div>
    </form>
  );
};

export default ChatInput;
