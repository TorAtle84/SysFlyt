"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { format } from "date-fns"
import { nb } from "date-fns/locale"
import { cn } from "@/lib/utils"
import { Send, User as UserIcon, MessageCircle } from "lucide-react"

interface User {
    id: string
    firstName: string
    lastName: string
}

interface Comment {
    id: string
    content: string
    createdAt: string
    user: User
}

interface CommentThreadProps {
    projectId: string
    protocolId?: string
    itemId?: string
    apiBase?: string
    initialComments?: Comment[]
    members: User[] // Needed for mention lookup
    initialCommentId?: string
}

export function CommentThread({ projectId, protocolId, itemId, apiBase, members, initialCommentId }: CommentThreadProps) {
    const [comments, setComments] = useState<Comment[]>([])
    const [content, setContent] = useState("")
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [showMentions, setShowMentions] = useState(false)
    const [cursorPosition, setCursorPosition] = useState(0)
    const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null)
    const hasAutoScrolledRef = useRef(false)

    // Fetch comments on mount
    const endpoint = apiBase || (protocolId && itemId
        ? `/api/projects/${projectId}/mc-protocols/${protocolId}/items/${itemId}/comments`
        : "")

    useEffect(() => {
        if (!endpoint) return
        fetch(endpoint)
            .then(res => res.json())
            .then(data => {
                if (data.comments) setComments(data.comments)
            })
            .catch(console.error)
    }, [endpoint])

    useEffect(() => {
        hasAutoScrolledRef.current = false
        setHighlightCommentId(null)
    }, [itemId, initialCommentId])

    useEffect(() => {
        if (!initialCommentId) return
        if (comments.length === 0) return
        if (hasAutoScrolledRef.current) return

        const el = document.getElementById(`mc-comment-${initialCommentId}`)
        if (!el) return

        el.scrollIntoView({ behavior: "smooth", block: "center" })
        hasAutoScrolledRef.current = true

        setHighlightCommentId(initialCommentId)
        window.setTimeout(() => setHighlightCommentId(null), 3500)
    }, [comments, initialCommentId])

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "@") {
            // Trigger mention list? Handled by onChange usually for better cursor tracking
        }
    }

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value
        setContent(val)

        // Simple mention detection: check if last word starts with @
        const cursorPos = e.target.selectionStart
        setCursorPosition(cursorPos)

        const textBeforeCursor = val.substring(0, cursorPos)
        const lastWord = textBeforeCursor.split(/\s+/).pop()

        if (lastWord && lastWord.startsWith("@") && lastWord.length > 1) {
            setShowMentions(true)
        } else {
            setShowMentions(false)
        }
    }

    const insertMention = (user: User) => {
        const textBeforeCursor = content.substring(0, cursorPosition)
        const textAfterCursor = content.substring(cursorPosition)
        const words = textBeforeCursor.split(/\s+/)
        words.pop() // Remove the partial @mention directly

        const newText = [...words, `@${user.firstName} ${user.lastName} `].join(" ") + textAfterCursor
        setContent(newText)
        setShowMentions(false)
        // Focus back on textarea would be ideal
    }

    const handleSubmit = async () => {
        if (!content.trim()) return
        setIsSubmitting(true)

        // Parse mentions for notification
        const mentionedIds = members
            .filter(m => content.includes(`@${m.firstName} ${m.lastName}`))
            .map(m => m.id)

        try {
            if (!endpoint) {
                throw new Error("Mangler endepunkt for kommentarer")
            }
            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content, mentions: mentionedIds })
            })

            if (res.ok) {
                const data = await res.json()
                setComments(prev => [...prev, data.comment])
                setContent("")
            }
        } catch (e) {
            console.error(e)
        } finally {
            setIsSubmitting(false)
        }
    }

    // Filter members for mention list
    const mentionQuery = content.substring(0, cursorPosition).split(/\s+/).pop()?.substring(1).toLowerCase() || ""
    const filteredMembers = members.filter(m =>
        m.firstName.toLowerCase().includes(mentionQuery) ||
        m.lastName.toLowerCase().includes(mentionQuery)
    )

    return (
        <div className="flex flex-col h-full bg-card rounded-md border border-border text-sm">
            <div className="flex-1 overflow-y-auto p-3 space-y-4 max-h-[300px]">
                {comments.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground opacity-50">
                        <MessageCircle size={32} strokeWidth={1} className="mb-2" />
                        <p className="text-sm italic">Ingen meldinger ennå</p>
                    </div>
                )}
                {comments.map(comment => (
                    <div
                        key={comment.id}
                        id={`mc-comment-${comment.id}`}
                        className={cn(
                            "flex gap-3 items-start group scroll-mt-24",
                            comment.id === highlightCommentId && "rounded-lg bg-primary/5 ring-1 ring-primary/30 p-2"
                        )}
                    >
                        <Avatar className="h-7 w-7 mt-0.5">
                            <AvatarFallback className="text-[10px] bg-primary/10 text-primary">
                                {comment.user.firstName[0]}{comment.user.lastName[0]}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 space-y-1">
                            <div className="flex items-baseline justify-between">
                                <span className="font-medium text-sm text-foreground">{comment.user.firstName} {comment.user.lastName}</span>
                                <span className="text-[10px] text-muted-foreground">
                                    {format(new Date(comment.createdAt), "d. MMM HH:mm", { locale: nb })}
                                </span>
                            </div>
                            <div className="bg-muted/30 p-2.5 rounded-lg text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                                {comment.content}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            <div className="p-3 border-t bg-background relative">
                {showMentions && filteredMembers.length > 0 && (
                    <div className="absolute bottom-full left-3 w-48 bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto z-10 mb-2">
                        {filteredMembers.map(m => (
                            <button
                                key={m.id}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground flex items-center gap-2 transition-colors"
                                onClick={() => insertMention(m)}
                            >
                                <UserIcon size={12} className="opacity-50" />
                                <span className="font-medium">{m.firstName} {m.lastName}</span>
                            </button>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 items-end bg-muted/20 p-1.5 rounded-xl border border-input/50 focus-within:border-ring/50 focus-within:ring-1 focus-within:ring-ring/20 transition-all">
                    <div className="flex-1 min-w-0">
                        <Textarea
                            value={content}
                            onChange={handleChange}
                            placeholder="Skriv en melding... (bruk @ for å nevne)"
                            className="min-h-[40px] max-h-[120px] resize-none text-base sm:text-sm py-2 bg-transparent border-0 focus-visible:ring-0 px-2 shadow-none placeholder:text-muted-foreground/70 w-full"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSubmit();
                                }
                            }}
                        />
                    </div>
                    <Button
                        size="icon"
                        className={cn("h-8 w-8 shrink-0 rounded-lg transition-all mb-1", content.trim() ? "opacity-100" : "opacity-50")}
                        onClick={handleSubmit}
                        disabled={isSubmitting || !content.trim()}
                        variant={content.trim() ? "default" : "ghost"}
                    >
                        <Send size={14} />
                    </Button>
                </div>
            </div>
        </div>
    )
}
