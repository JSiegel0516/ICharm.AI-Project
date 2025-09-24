'use client';

import React, { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, User } from 'lucide-react';
import { ChatMessage } from '@/types';

interface ChatPageProps {
  show: boolean;
  onClose: () => void;
}

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
    setInputValue('');
    setIsTyping(true);

    // Simulate AI response delay
    setTimeout(() => {
      const responses = [
        'I can help you analyze temperature patterns across different regions. What specific area interests you?',
        'This dataset shows monthly temperature averages. Would you like to explore seasonal variations?',
        'The color gradient represents temperature ranges. What questions do you have about the data?',
        'I can explain climate trends, help you navigate the interface, or provide insights about specific regions.',
        'Let me help you understand the data visualization. Which aspect would you like to explore?',
        'Would you like me to explain how to interpret the color patterns on the globe?',
        'I can guide you through the different datasets available. What type of climate data interests you most?',
        'The precipitation data shows interesting patterns. Would you like me to highlight specific regions?',
        "I notice you're looking at sea surface temperatures. These can indicate climate change trends.",
      ];

      const randomResponse =
        responses[Math.floor(Math.random() * responses.length)];
      const botMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'bot',
        message: randomResponse,
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botMessage]);
      setIsTyping(false);
    }, 1500);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex h-[500px] w-80 transform flex-col rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-900/95 to-purple-900/95 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out ${
        show
          ? 'translate-x-0 scale-100 opacity-100'
          : 'pointer-events-none translate-x-full scale-95 opacity-0'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between rounded-t-2xl border-b border-blue-500/20 bg-gradient-to-r from-blue-800/50 to-purple-800/50 p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600">
            <Bot size={16} className="text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-blue-100">
              Climate AI Assistant
            </h1>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-full p-1 text-blue-300 transition-colors hover:bg-blue-600/30 hover:text-white"
        >
          <X size={18} />
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type === 'bot' && (
              <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
                <Bot size={16} className="text-white" />
              </div>
            )}

            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 ${
                message.type === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'border border-blue-500/30 bg-blue-800/40 text-blue-100'
              }`}
            >
              <p className="text-sm leading-relaxed">{message.message}</p>
            </div>

            {message.type === 'user' && (
              <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-purple-600">
                <User size={16} className="text-white" />
              </div>
            )}
          </div>
        ))}

        {/* Typing Indicator */}
        {isTyping && (
          <div className="flex justify-start gap-3">
            <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-600">
              <Bot size={16} className="text-white" />
            </div>
            <div className="rounded-2xl border border-blue-500/30 bg-blue-800/40 px-3 py-2 text-blue-100">
              <div className="flex items-center gap-1">
                <div className="flex space-x-1">
                  <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-300"></div>
                  <div
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-300"
                    style={{ animationDelay: '0.1s' }}
                  ></div>
                  <div
                    className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-300"
                    style={{ animationDelay: '0.2s' }}
                  ></div>
                </div>
                <span className="ml-2 text-xs text-blue-300">
                  AI is typing...
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="rounded-b-2xl border-t border-blue-500/20 bg-gradient-to-r from-blue-800/50 to-purple-800/50 p-3">
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about climate data..."
            className="flex-1 rounded-xl border border-blue-500/30 bg-blue-900/50 px-3 py-2 text-sm text-blue-100 placeholder-blue-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isTyping}
            className="flex items-center justify-center rounded-xl bg-blue-600 p-2 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatPage;
