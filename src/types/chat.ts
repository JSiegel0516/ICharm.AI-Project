export interface ChatMessage {
  id: string;
  type: "user" | "bot";
  content: string;
  timestamp: Date;
}

export class ChatService {
  private static instance: ChatService;
  private messageHistory: ChatMessage[] = [];

  static getInstance(): ChatService {
    if (!ChatService.instance) {
      ChatService.instance = new ChatService();
    }
    return ChatService.instance;
  }

  private constructor() {
    // Initialize with welcome message
    this.messageHistory = [
      {
        id: "1",
        type: "bot",
        content: "Hello! How can I help?",
        timestamp: new Date(),
      },
    ];
  }

  // Simple placeholder responses for UI testing
  private getPlaceholderResponse(userMessage: string): string {
    const responses = [
      "I can help answer questions or explain things step by step.",
      "Tell me what you'd like to know, and I'll do my best to help.",
      "I'm here to assist. What can I help you with?",
      "Feel free to ask me anything.",
    ];

    // Simple keyword matching for demonstration
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes("hello") || lowerMessage.includes("hi")) {
      return "Hello there! How can I help today?";
    }

    if (lowerMessage.includes("help")) {
      return "I'm here to help. What do you need?";
    }

    if (lowerMessage.includes("thank")) {
      return "You're welcome! Let me know if you need anything else.";
    }

    // Return random response for other messages
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async sendMessage(content: string): Promise<ChatMessage> {
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: "user",
      content,
      timestamp: new Date(),
    };

    this.messageHistory.push(userMessage);

    // Simulate typing delay
    await new Promise((resolve) =>
      setTimeout(resolve, 800 + Math.random() * 1500),
    );

    // Generate bot response (placeholder for now)
    const botMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      type: "bot",
      content: this.getPlaceholderResponse(content),
      timestamp: new Date(),
    };

    this.messageHistory.push(botMessage);
    return botMessage;
  }

  getMessages(): ChatMessage[] {
    return [...this.messageHistory];
  }

  clearHistory(): void {
    this.messageHistory = [
      {
        id: "1",
        type: "bot",
        content: "Hello! How can I help?",
        timestamp: new Date(),
      },
    ];
  }
}

export const chatService = ChatService.getInstance();
