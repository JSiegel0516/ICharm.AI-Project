"use client";

import { useState, useRef, useEffect } from "react";

export interface ChatMessage {
  id: string;
  type: "user" | "bot";
  content: string;
  timestamp: Date;
}

export interface UseChatReturn {
  messages: ChatMessage[];
  isTyping: boolean;
  sendMessage: (content: string) => void;
  clearMessages: () => void;
}

export function useChat(): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      type: "bot",
      content: "Hello! How can I help?",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messageIdCounter = useRef(2);

  const botResponses = [
    "I'm here to help. What can I do for you?",
    "Tell me what you're trying to accomplish.",
    "I can answer questions or walk through steps if needed.",
    "How can I assist?",
  ];

  const contextualResponses: Record<string, string[]> = {
    help: [
      "I can answer questions or help clarify what you need.",
      "Tell me what you'd like to do, and I can guide you.",
    ],
  };

  const generateBotResponse = (userMessage: string): string => {
    const lowerMessage = userMessage.toLowerCase();

    // Check for contextual keywords
    for (const [keyword, responses] of Object.entries(contextualResponses)) {
      if (lowerMessage.includes(keyword)) {
        return responses[Math.floor(Math.random() * responses.length)];
      }
    }

    // Check for specific questions
    if (
      lowerMessage.includes("how") ||
      lowerMessage.includes("what") ||
      lowerMessage.includes("why")
    ) {
      const questionResponses = [
        "That's a great question. Can you share a bit more detail?",
        "I can help with that. What specifically are you looking for?",
        "Could you clarify what you'd like to know?",
      ];
      return questionResponses[
        Math.floor(Math.random() * questionResponses.length)
      ];
    }

    if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
      return "Hello there! How can I help today?";
    }

    if (lowerMessage.includes("thank")) {
      return "You're welcome! Let me know if you need anything else.";
    }

    // Default to random response
    return botResponses[Math.floor(Math.random() * botResponses.length)];
  };

  const sendMessage = (content: string) => {
    if (!content.trim()) return;

    // Add user message
    const userMessage: ChatMessage = {
      id: messageIdCounter.current.toString(),
      type: "user",
      content: content.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    messageIdCounter.current++;

    // Set typing indicator
    setIsTyping(true);

    // Simulate bot thinking time
    const responseDelay = Math.random() * 2000 + 1000; // 1-3 seconds

    setTimeout(() => {
      const botResponse: ChatMessage = {
        id: messageIdCounter.current.toString(),
        type: "bot",
        content: generateBotResponse(content),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, botResponse]);
      messageIdCounter.current++;
      setIsTyping(false);
    }, responseDelay);
  };

  const clearMessages = () => {
    setMessages([
      {
        id: "1",
        type: "bot",
        content: "Hello! How can I help?",
        timestamp: new Date(),
      },
    ]);
    messageIdCounter.current = 2;
    setIsTyping(false);
  };

  return {
    messages,
    isTyping,
    sendMessage,
    clearMessages,
  };
}
