'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User } from 'lucide-react';
import { ChatMessage, ChatPageProps } from '@/types';

const ChatPage: React.FC<ChatPageProps> = ({ show, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'bot',
      message: 'How can I help you analyze the climate data?',
      timestamp: new Date(),
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
    }
  }, [show]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      message: inputValue,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputValue;
    setInputValue('');
    setIsTyping(true);

    try {
      // Build conversation history for context
      const conversationHistory = messages.map((msg) => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.message,
      }));

      // Add the current user message
      conversationHistory.push({
        role: 'user',
        content: currentInput,
      });

      console.log('Sending to API:', conversationHistory); // Debug log

      // Call the backend API with timeout
      let response;
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: conversationHistory,
          }),
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        console.log('Fetch completed!'); // Debug log
      } catch (fetchError) {
        console.error('Fetch failed:', fetchError);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          throw new Error('Request timed out after 30 seconds');
        }
        throw fetchError;
      }

      console.log('Response status:', response.status); // Debug log
      console.log('Response ok:', response.ok); // Debug log
      console.log('Response headers:', response.headers); // Debug log

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API error response:', errorText);
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      console.log('About to parse JSON response...'); // Debug log

      // Parse JSON response directly
      const data = await response.json();
      console.log('Received data:', data); // Debug log

      const botResponse = data.content || '';
      console.log('Bot response:', botResponse); // Debug log

      if (!botResponse) {
        throw new Error('Empty response from API');
      }

      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        message: botResponse,
        timestamp: new Date(),
      };

      console.log('Adding bot message:', botMessage); // Debug log
      setMessages((prev) => [...prev, botMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        message: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex h-[500px] w-80 transform flex-col rounded-xl border border-gray-600/30 bg-gray-800/95 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out ${
        show
          ? 'translate-x-0 scale-100 opacity-100'
          : 'pointer-events-none translate-x-full scale-95 opacity-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-xl border-b border-gray-700/50 bg-gray-900/50 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700">
            <Bot size={16} className="text-gray-200" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-200">
              Climate AI Assistant
            </h1>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-700/50 hover:text-gray-200"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'bot' && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700">
                <Bot size={16} className="text-gray-200" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                message.type === 'user'
                  ? 'bg-gray-700 text-gray-100'
                  : 'border border-gray-700/30 bg-gray-900/30 text-gray-200'
              }`}
            >
              <p className="text-sm leading-relaxed">{message.message}</p>
            </div>

            {message.type === 'user' && (
              <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-600">
                <User size={16} className="text-gray-200" />
              </div>
            )}
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start gap-3">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700">
              <Bot size={16} className="text-gray-200" />
            </div>
            <div className="rounded-2xl border border-gray-700/30 bg-gray-900/30 px-3 py-2 text-gray-200">
              <div className="flex items-center gap-1">
                <div className="flex space-x-1">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"></div>
                  <div
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: '0.1s' }}
                  ></div>
                  <div
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                    style={{ animationDelay: '0.2s' }}
                  ></div>
                </div>
                <span className="ml-2 text-xs text-gray-400">
                  AI is typing...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="rounded-b-xl border-t border-gray-700/50 bg-gray-900/50 p-3">
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about climate data..."
            className="flex-1 rounded-xl border border-gray-700/30 bg-gray-900/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-600"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="flex items-center justify-center rounded-xl bg-gray-700 p-2 text-gray-200 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #475569;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #64748b;
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default ChatPage;