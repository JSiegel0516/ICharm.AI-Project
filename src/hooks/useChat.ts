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
      content:
        "Hello! I'm your climate data assistant. How can I help you explore weather patterns today?",
      timestamp: new Date(),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messageIdCounter = useRef(2);

  const botResponses = [
    "I can help you analyze temperature patterns across different regions. What specific area interests you?",
    "This dataset shows monthly temperature averages. Would you like to explore seasonal variations?",
    "The color gradient represents temperature ranges from -30°C to 30°C. What questions do you have about the data?",
    "I can explain climate trends, help you navigate the interface, or provide insights about specific regions.",
    "Would you like to know more about how global warming affects different parts of the world?",
    "The visualization shows real-time climate data. Try clicking on different regions to see local patterns!",
    "Climate data can reveal fascinating patterns. What aspect of weather interests you most?",
    "I notice you're exploring our platform. Would you like a quick tour of the features?",
    "Temperature variations can tell us a lot about climate change. What would you like to learn?",
    "The globe shows global temperature distribution. Would you like me to explain the color coding?",
  ];

  const contextualResponses: Record<string, string[]> = {
    temperature: [
      "Temperature data shows significant variations across latitudes. Equatorial regions typically show temperatures between 25-30°C.",
      "Global temperature trends have shown an average increase of 1.1°C since pre-industrial times.",
      "Ocean temperatures affect weather patterns worldwide through currents and evaporation cycles.",
    ],
    climate: [
      "Climate patterns are influenced by ocean currents, atmospheric circulation, and geographic features.",
      "Climate change affects different regions differently - Arctic regions warm faster than global average.",
      "Long-term climate data helps us understand natural variability versus human influence.",
    ],
    data: [
      "Our data comes from weather stations, satellites, and oceanographic buoys worldwide.",
      "The visualization updates with the latest available climate reanalysis data.",
      "Data quality varies by region - oceanic areas have fewer direct measurements.",
    ],
    help: [
      "You can interact with the globe by rotating it to see different regions.",
      "The color bar shows the temperature scale - hover over it to see exact values.",
      "Try the settings menu to customize the visualization to your preferences.",
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
        "That's a great question! Climate visualization helps us understand complex atmospheric patterns through intuitive visual representations.",
        "The data you see is processed from multiple sources including satellite observations and ground-based measurements.",
        "Global climate models use mathematical equations to simulate atmospheric and oceanic processes.",
      ];
      return questionResponses[
        Math.floor(Math.random() * questionResponses.length)
      ];
    }

    if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
      return "Hello there! I'm excited to help you explore climate data. What would you like to discover today?";
    }

    if (lowerMessage.includes("thank")) {
      return "You're very welcome! Feel free to ask me anything else about climate data or how to use the platform.";
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
        content:
          "Hello! I'm your climate data assistant. How can I help you explore weather patterns today?",
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
