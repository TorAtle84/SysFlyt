"use client";

import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { useLinkDog } from "./linkdog-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { getQuickSuggestions } from "@/lib/linkdog/system-prompt";
import ReactMarkdown from "react-markdown";

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export function LinkDogPopup() {
    const linkdog = useLinkDog();
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [irrelevantCount, setIrrelevantCount] = useState(0);
    const [conversationEnded, setConversationEnded] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Return early if no context (during SSG or when not in provider)
    const isOpen = linkdog?.isOpen ?? false;
    const toggleOpen = linkdog?.toggleOpen ?? (() => { });
    const currentPage = linkdog?.currentPage ?? '';
    const currentApp = linkdog?.currentApp ?? 'syslink';
    const settings = linkdog?.settings;

    // Auto-focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    // Scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Show welcome message on first open
    useEffect(() => {
        if (isOpen && messages.length === 0) {
            setMessages([{
                id: 'welcome',
                role: 'assistant',
                content: 'Hei! Jeg er LinkDog, din vennlige hjelper! 🐕 Hva kan jeg hjelpe deg med i dag?',
                timestamp: new Date()
            }]);
        }
    }, [isOpen, messages.length]);

    async function sendMessage() {
        if (!input.trim() || isLoading || conversationEnded) return;

        const userMessage: Message = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput("");
        setIsLoading(true);

        try {
            const res = await fetch('/api/linkdog/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage.content,
                    context: {
                        currentPage,
                        app: currentApp,
                    },
                    irrelevantCount,
                }),
            });

            const data = await res.json();

            if (data.error) {
                setMessages(prev => [...prev, {
                    id: `error-${Date.now()}`,
                    role: 'assistant',
                    content: data.error,
                    timestamp: new Date()
                }]);
            } else if (data.response) {
                setMessages(prev => [...prev, {
                    id: `assistant-${Date.now()}`,
                    role: 'assistant',
                    content: data.response,
                    timestamp: new Date()
                }]);

                if (data.shouldEnd) {
                    setConversationEnded(true);
                }

                if (typeof data.irrelevantCount === 'number') {
                    setIrrelevantCount(data.irrelevantCount);
                }
            }
        } catch (error) {
            console.error("Error sending message:", error);
            setMessages(prev => [...prev, {
                id: `error-${Date.now()}`,
                role: 'assistant',
                content: 'Beklager, noe gikk galt. Prøv igjen! 🐕',
                timestamp: new Date()
            }]);
        } finally {
            setIsLoading(false);
        }
    }

    function handleKeyDown(e: KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    }

    function resetConversation() {
        setMessages([]);
        setIrrelevantCount(0);
        setConversationEnded(false);
    }

    const quickSuggestions = getQuickSuggestions({
        currentPage,
        app: currentApp,
        userRole: '',
        appAccess: [],
        isAdmin: false
    });

    // Return null if not in context or not enabled
    if (!linkdog || !settings?.enabled) return null;

    return (
        <>
            {/* Floating Button */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={toggleOpen}
                        className="fixed bottom-6 right-6 z-50 w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg flex items-center justify-center cursor-pointer hover:shadow-xl transition-shadow"
                        aria-label="Åpne LinkDog"
                    >
                        <span className="text-3xl">🐕</span>
                    </motion.button>
                )}
            </AnimatePresence>

            {/* Chat Popup */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="fixed bottom-6 right-6 z-50 w-96 h-[500px] max-h-[80vh] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white">
                            <div className="flex items-center gap-2">
                                <span className="text-2xl">🐕</span>
                                <div>
                                    <h3 className="font-semibold">LinkDog</h3>
                                    <p className="text-xs opacity-80">Din vennlige hjelper</p>
                                </div>
                            </div>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={toggleOpen}
                                className="text-white hover:bg-white/20"
                            >
                                <X className="h-5 w-5" />
                            </Button>
                        </div>

                        {/* Messages */}
                        <ScrollArea className="flex-1 p-4" ref={scrollRef}>
                            <div className="space-y-4">
                                {messages.map((msg) => (
                                    <div
                                        key={msg.id}
                                        className={cn(
                                            "flex",
                                            msg.role === 'user' ? "justify-end" : "justify-start"
                                        )}
                                    >
                                        <div
                                            className={cn(
                                                "max-w-[80%] rounded-2xl px-4 py-2",
                                                msg.role === 'user'
                                                    ? "bg-primary text-primary-foreground rounded-br-none"
                                                    : "bg-muted rounded-bl-none"
                                            )}
                                        >
                                            {msg.role === 'assistant' ? (
                                                <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
                                                    <ReactMarkdown
                                                        components={{
                                                            a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
                                                                <a
                                                                    href={href}
                                                                    className="text-primary hover:underline"
                                                                    onClick={(e) => {
                                                                        if (href?.startsWith('/')) {
                                                                            e.preventDefault();
                                                                            window.location.href = href;
                                                                        }
                                                                    }}
                                                                >
                                                                    {children}
                                                                </a>
                                                            )
                                                        }}
                                                    >
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>
                                            ) : (
                                                <p className="text-sm">{msg.content}</p>
                                            )}
                                        </div>
                                    </div>
                                ))}

                                {isLoading && (
                                    <div className="flex justify-start">
                                        <div className="bg-muted rounded-2xl rounded-bl-none px-4 py-3">
                                            <div className="flex items-center gap-2 text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                <span className="text-sm">Tenker...</span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Quick Suggestions (only show at start) */}
                            {messages.length === 1 && !isLoading && (
                                <div className="mt-4 space-y-2">
                                    <p className="text-xs text-muted-foreground">Hurtigvalg:</p>
                                    <div className="flex flex-wrap gap-2">
                                        {quickSuggestions.map((suggestion, i) => (
                                            <button
                                                key={i}
                                                onClick={() => {
                                                    setInput(suggestion);
                                                    inputRef.current?.focus();
                                                }}
                                                className="text-xs px-3 py-1.5 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                                            >
                                                {suggestion}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </ScrollArea>

                        {/* Input */}
                        <div className="p-4 border-t">
                            {conversationEnded ? (
                                <Button
                                    onClick={resetConversation}
                                    variant="outline"
                                    className="w-full"
                                >
                                    Start ny samtale
                                </Button>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <Input
                                        ref={inputRef}
                                        value={input}
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Skriv en melding..."
                                        disabled={isLoading}
                                        className="flex-1 min-w-0"
                                    />
                                    <Button
                                        onClick={sendMessage}
                                        disabled={!input.trim() || isLoading}
                                        size="icon"
                                        className="shrink-0"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
