'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
} from 'react';
import {
  X,
  Send,
  Bot,
  User,
  Clock,
  ChevronDown,
  Plus,
  Loader2,
  Trash2,
} from 'lucide-react';
import { ChatMessage, ChatPageProps } from '@/types';

type SessionSummary = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const GREETING = 'How can I help you analyze the climate data?';

const createGreetingMessage = (): ChatMessage => ({
  id: `welcome-${Date.now()}`,
  type: 'bot',
  message: GREETING,
  timestamp: new Date(),
});

const formatSessionTitle = (session: SessionSummary) =>
  session.title?.trim() || 'New Conversation';

const formatUpdatedAt = (date: Date) =>
  date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

const ChatPage: React.FC<ChatPageProps> = ({ show, onClose }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    createGreetingMessage(),
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const historyButtonRef = useRef<HTMLButtonElement>(null);
  const historyMenuRef = useRef<HTMLDivElement>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (show && inputRef.current) {
      inputRef.current.focus();
    }
  }, [show]);

  useEffect(() => {
    if (!isHistoryOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        historyMenuRef.current?.contains(target) ||
        historyButtonRef.current?.contains(target)
      ) {
        return;
      }
      setIsHistoryOpen(false);
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isHistoryOpen]);

  const loadSessions = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const response = await fetch('/api/chat/sessions');
      if (!response.ok) {
        throw new Error(`Failed to fetch sessions (${response.status})`);
      }

      const data = await response.json();
      const fetched: SessionSummary[] = (data?.sessions ?? []).map(
        (session: any) => ({
          id: session.id,
          title: session.title ?? null,
          createdAt: new Date(
            session.createdAt ?? session.created_at ?? Date.now()
          ),
          updatedAt: new Date(
            session.updatedAt ?? session.updated_at ?? Date.now()
          ),
        })
      );

      fetched.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
      );
      setSessions(fetched);
    } catch (error) {
      console.error('Failed to load chat sessions', error);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const createSession = useCallback(async (title?: string) => {
    const response = await fetch('/api/chat/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(
        title && title.trim() ? { title: title.trim() } : {}
      ),
    });

    if (!response.ok) {
      throw new Error(`Failed to create session (${response.status})`);
    }

    const data = await response.json();
    const session: SessionSummary = {
      id: data.session.id,
      title: data.session.title ?? null,
      createdAt: new Date(
        data.session.createdAt ?? data.session.created_at ?? Date.now()
      ),
      updatedAt: new Date(
        data.session.updatedAt ?? data.session.updated_at ?? Date.now()
      ),
    };

    setSessions((prev) => [session, ...prev.filter((s) => s.id !== session.id)]);
    return session;
  }, []);

  const loadSessionMessages = useCallback(
    async (targetSessionId: string) => {
      setIsLoadingMessages(true);
      setMessages([]);

      try {
        const response = await fetch(
          `/api/chat/sessions/${targetSessionId}/messages`
        );

        if (!response.ok) {
          throw new Error(
            `Failed to load session messages (${response.status})`
          );
        }

        const data = await response.json();
        const history: ChatMessage[] = (data?.messages ?? []).map(
          (message: any) => ({
            id: message.id,
            type: message.role === 'user' ? 'user' : 'bot',
            message: message.content,
            timestamp: new Date(
              message.createdAt ?? message.created_at ?? Date.now()
            ),
            sources: message.sources ?? undefined,
          })
        );

        setSessionId(targetSessionId);
        setMessages(history.length > 0 ? history : [createGreetingMessage()]);
      } catch (error) {
        console.error('Failed to load session messages', error);
        setMessages([createGreetingMessage()]);
      } finally {
        setIsLoadingMessages(false);
        setIsTyping(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!show) {
      return;
    }
    void loadSessions();
  }, [show, loadSessions]);

  useEffect(() => {
    if (!show || sessionId || sessions.length === 0) {
      return;
    }
    void loadSessionMessages(sessions[0].id);
  }, [show, sessionId, sessions, loadSessionMessages]);

  const handleToggleHistory = () => {
    setIsHistoryOpen((prev) => !prev);
    if (!isHistoryOpen) {
      void loadSessions();
    }
  };

  const handleSelectSession = (id: string) => {
    setIsHistoryOpen(false);
    void loadSessionMessages(id);
  };

  const handleStartNewChat = async () => {
    try {
      const session = await createSession();
      setSessionId(session.id);
      setMessages([createGreetingMessage()]);
      setIsHistoryOpen(false);
    } catch (error) {
      console.error('Failed to start new chat', error);
    }
  };

  const handleDeleteSession = async () => {
    if (!sessionId) {
      return;
    }

    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete session (${response.status})`);
      }

      setSessionId(null);
      setMessages([createGreetingMessage()]);
      setIsDeleteModalOpen(false);
      void loadSessions();
    } catch (error) {
      console.error('Failed to delete session', error);
      setIsDeleteModalOpen(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim()) {
      return;
    }

    const newMessage: ChatMessage = {
      id: `${Date.now()}`,
      type: 'user',
      message: inputValue,
      timestamp: new Date(),
    };

    const nextMessages = [...messages, newMessage];
    setMessages(nextMessages);
    setInputValue('');
    setIsTyping(true);

    let activeSessionId = sessionId;

    try {
      if (!activeSessionId) {
        const session = await createSession();
        activeSessionId = session.id;
        setSessionId(session.id);
      }

      const conversationHistory = nextMessages.map((msg) => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.message,
      }));

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: conversationHistory,
          sessionId: activeSessionId,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();

      if (typeof data.sessionId === 'string') {
        setSessionId(data.sessionId);
        activeSessionId = data.sessionId;
      }

      const botResponse = (data.content ?? '').trim();
      if (!botResponse) {
        throw new Error('Empty response from API');
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now() + 1}`,
        type: 'bot',
        message: botResponse,
        timestamp: new Date(),
        sources: Array.isArray(data.sources) ? data.sources : undefined,
      };

      setMessages((prev) => [...prev, assistantMessage]);
      void loadSessions();
    } catch (error) {
      console.error('Chat API error:', error);

      const fallbackMessage: ChatMessage = {
        id: `${Date.now()}-error`,
        type: 'bot',
        message:
          error instanceof Error
            ? `Sorry, something went wrong: ${error.message}`
            : 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, fallbackMessage]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSendMessage();
    }
  };

  return (
    <>
      <div
      className={`fixed bottom-6 right-6 z-50 flex h-[500px] w-80 transform flex-col rounded-xl border border-gray-600/30 bg-gray-800/95 shadow-2xl backdrop-blur-sm transition-all duration-300 ease-out ${
        show
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-6 opacity-0'
      }`}
    >
      <div className="rounded-t-xl border-b border-gray-700/50 bg-gray-900/60 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-700">
              <Bot size={18} className="text-gray-200" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-200">
                CharmBot
              </h1>
              <p className="text-xs text-gray-400">
                Ask anything about datasets or analysis tools.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-gray-700/40 hover:text-gray-200"
            aria-label="Close chat"
          >
            <X size={16} />
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <div className="relative">
            <button
              ref={historyButtonRef}
              onClick={handleToggleHistory}
              className="flex items-center gap-1 rounded-lg border border-gray-700/40 bg-gray-800/70 px-2.5 py-1.5 text-xs font-medium text-gray-100 transition hover:border-gray-600 hover:bg-gray-700"
            >
              <Clock size={14} />
              <span>History</span>
              <ChevronDown
                size={12}
                className={`transition-transform ${
                  isHistoryOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {isHistoryOpen && (
              <div
                ref={historyMenuRef}
                className="absolute right-0 z-40 mt-2 w-64 rounded-lg border border-gray-700/40 bg-gray-900/95 p-2 text-sm text-gray-100 shadow-xl"
              >
                {isLoadingSessions ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading conversations…
                  </div>
                ) : sessions.length === 0 ? (
                  <p className="px-2 py-4 text-xs text-gray-400">
                    No conversations yet.
                  </p>
                ) : (
                  <ul className="custom-scrollbar max-h-56 space-y-1 overflow-y-auto pr-1">
                    {sessions.map((session) => {
                      const isActive = session.id === sessionId;
                      return (
                        <li key={session.id}>
                          <button
                            onClick={() => handleSelectSession(session.id)}
                            className={`w-full rounded-md px-2 py-2 text-left transition ${
                              isActive
                                ? 'bg-gray-700/70 text-gray-50'
                                : 'hover:bg-gray-800/70'
                            }`}
                          >
                            <p className="truncate text-sm font-medium">
                              {formatSessionTitle(session)}
                            </p>
                            <p className="mt-0.5 text-xs text-gray-400">
                              {formatUpdatedAt(session.updatedAt)}
                            </p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleStartNewChat}
            className="flex items-center gap-1 rounded-lg border border-gray-700/40 bg-gray-800/70 px-2.5 py-1.5 text-xs font-medium text-gray-100 transition hover:border-gray-600 hover:bg-gray-700"
          >
            <Plus size={14} />
            <span>New</span>
          </button>
          <button
            onClick={() => setIsDeleteModalOpen(true)}
            disabled={!sessionId}
            className="flex items-center gap-1 rounded-lg border border-red-700/40 bg-red-900/70 px-2.5 py-1.5 text-xs font-medium text-red-100 transition hover:border-red-600 hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={12} />
            <span>Delete</span>
          </button>
        </div>
      </div>

      <div className="custom-scrollbar flex-1 space-y-3 overflow-y-auto p-4">
        {isLoadingMessages ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading conversation…
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex gap-3 ${
                  message.type === 'user'
                    ? 'justify-end'
                    : 'justify-start'
                }`}
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

            {isTyping && (
              <div className="flex justify-start gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700">
                  <Bot size={16} className="text-gray-200" />
                </div>
                <div className="rounded-2xl border border-gray-700/30 bg-gray-900/30 px-3 py-2 text-gray-200">
                  <div className="flex items-center gap-1">
                    <div className="flex space-x-1">
                      <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400" />
                      <div
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                        style={{ animationDelay: '0.1s' }}
                      />
                      <div
                        className="h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
                        style={{ animationDelay: '0.2s' }}
                      />
                    </div>
                    <span className="ml-2 text-xs text-gray-400">
                      AI is typing...
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      <div className="rounded-b-xl border-t border-gray-700/50 bg-gray-900/60 p-3">
        <div className="flex items-end gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask about climate data..."
            className="flex-1 rounded-xl border border-gray-700/30 bg-gray-900/30 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-600"
          />
          <button
            onClick={() => void handleSendMessage()}
            disabled={!inputValue.trim() || isTyping}
            className="flex items-center justify-center rounded-xl bg-gray-700 p-2 text-gray-200 transition-colors hover:bg-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={16} />
          </button>
        </div>
      </div>

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
      {isDeleteModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-gray-700 bg-gray-900 p-5 text-gray-100 shadow-2xl">
            <h2 className="text-lg font-semibold text-red-200">
              Delete Conversation?
            </h2>
            <p className="mt-2 text-sm text-gray-300">
              This will permanently remove the current chat session, including all messages. This action cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setIsDeleteModalOpen(false)}
                className="rounded-lg border border-gray-600 px-3 py-1.5 text-sm text-gray-200 transition hover:bg-gray-700/60"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSession}
                className="rounded-lg border border-red-700 bg-red-800 px-3 py-1.5 text-sm font-medium text-red-100 transition hover:border-red-600 hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ChatPage;
