export interface ChatMessage {
  id: string;
  type: 'user' | 'bot';
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
        id: '1',
        type: 'bot',
        content:
          "Hello! I'm your climate data assistant. How can I help you explore weather patterns today?",
        timestamp: new Date(),
      },
    ];
  }

  // Simple placeholder responses for UI testing
  private getPlaceholderResponse(userMessage: string): string {
    const responses = [
      'I can help you analyze temperature patterns across different regions. What specific area interests you?',
      'This dataset shows monthly temperature averages. Would you like to explore seasonal variations?',
      'The color gradient represents temperature ranges from -30°C to 30°C. What questions do you have about the data?',
      'I can explain climate trends, help you navigate the interface, or provide insights about specific regions.',
      'Would you like to know more about how to use the globe visualization?',
      'Try clicking and dragging on the globe to rotate it and explore different regions!',
      'The colorbar on the right shows the temperature scale. You can toggle it on and off.',
      'Feel free to ask me anything about climate data or how to use this platform!',
    ];

    // Simple keyword matching for demonstration
    const lowerMessage = userMessage.toLowerCase();

    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "Hello there! I'm excited to help you explore climate data. What would you like to discover today?";
    }

    if (lowerMessage.includes('help')) {
      return "I'm here to help! You can ask me about climate data, how to use the interface, or explore different regions on the globe.";
    }

    if (lowerMessage.includes('thank')) {
      return "You're very welcome! Feel free to ask me anything else about climate data.";
    }

    // Return random response for other messages
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async sendMessage(content: string): Promise<ChatMessage> {
    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content,
      timestamp: new Date(),
    };

    this.messageHistory.push(userMessage);

    // Simulate typing delay
    await new Promise((resolve) =>
      setTimeout(resolve, 800 + Math.random() * 1500)
    );

    // Generate bot response (placeholder for now)
    const botMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      type: 'bot',
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
        id: '1',
        type: 'bot',
        content:
          "Hello! I'm your climate data assistant. How can I help you explore weather patterns today?",
        timestamp: new Date(),
      },
    ];
  }
}

export const chatService = ChatService.getInstance();
