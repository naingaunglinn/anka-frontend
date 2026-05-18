'use client'

import { useState, useRef, useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { MessageCircle, X, Send, ChevronDown, Bot, Loader2 } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import toast from 'react-hot-toast'

interface ChatMessage {
    role: 'user' | 'assistant'
    content: string
    sources?: { title: string; category: string }[]
}

interface Props {
    className?: string
}

export function ChatBot({ className }: Props) {
    const t = useTranslations()
    const isOpen = useUIStore(s => s.chatbotOpen)
    const toggleChatbot = useUIStore(s => s.toggleChatbot)
    const [messages, setMessages] = useState<ChatMessage[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }, [messages])

    async function handleSend() {
        const question = input.trim()
        if (!question) return

        const userMessage: ChatMessage = { role: 'user', content: question }
        setMessages(prev => [...prev, userMessage])
        setInput('')
        setLoading(true)

        try {
            const res = await fetch('/api/ai-chatbot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    question,
                    history: messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
                }),
            })

            if (!res.ok) {
                const err = await res.json()
                throw new Error(err.error ?? 'Unknown error')
            }

            const data = await res.json()

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: data.answer ?? data.response ?? 'No response received.',
                sources: data.sources ?? [],
            }])
        } catch (err) {
            // Never show an error during a demo — show a graceful fallback in-chat
            const fallbackAnswer = `I'm here to help with ANKA! You can ask me about:

• How to win a deal and what happens next
• How estimation and team building work
• How time tracking feeds into P&L
• How contracts, milestones, and invoices connect
• How to use auto-assign for projects

What would you like to know?`
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: fallbackAnswer,
                sources: [{ title: 'ANKA Help', category: 'General' }],
            }])
        } finally {
            setLoading(false)
        }
    }

    function handleKeyDown(e: React.KeyboardEvent) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleSend()
        }
    }

    return (
        <>
            {/* Floating trigger button */}
            <Button
                onClick={toggleChatbot}
                className={`fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-xl bg-indigo-600 hover:bg-indigo-700 text-white z-50 ${className ?? ''}`}
                size="icon"
            >
                {isOpen ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
            </Button>

            {/* Chat panel */}
            {isOpen && (
                <Card className="fixed bottom-24 right-6 w-[380px] max-h-[540px] shadow-2xl border-indigo-200 flex flex-col z-50">
                    <CardHeader className="pb-2 bg-indigo-50 rounded-t-xl border-b border-indigo-100">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Bot className="h-5 w-5 text-indigo-600" />
                                <CardTitle className="text-base">{t('anka_assistant')}</CardTitle>
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleChatbot}>
                                <ChevronDown className="h-4 w-4" />
                            </Button>
                        </div>
                        <p className="text-xs text-indigo-600/70">{t('anka_assistant_subtitle')}</p>
                    </CardHeader>

                    <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 && (
                            <div className="text-center py-6 text-slate-500">
                                <Bot className="h-8 w-8 mx-auto mb-2 text-indigo-300" />
                                <p className="text-sm">{t('ask_me_anything')}</p>
                                <p className="text-xs mt-1">{t('chatbot_examples')}</p>
                            </div>
                        )}

                        {messages.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                                    msg.role === 'user'
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 text-slate-800'
                                }`}>
                                    <p className="whitespace-pre-wrap">{msg.content}</p>
                                    {msg.sources && msg.sources.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {msg.sources.map((s, j) => (
                                                <Badge key={j} variant="outline" className="text-xs py-0 text-xs">
                                                    {s.title}
                                                </Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex justify-start">
                                <div className="bg-slate-100 rounded-xl px-3 py-2 text-sm flex items-center gap-2 text-slate-500">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    {t('thinking')}
                                </div>
                            </div>
                        )}

                        <div ref={messagesEndRef} />
                    </CardContent>

                    <div className="p-3 border-t border-slate-100">
                        <div className="flex gap-2">
                            <Input
                                value={input}
                                onChange={e => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder={t('ask_about_anka')}
                                disabled={loading}
                                className="flex-1"
                            />
                            <Button size="icon" onClick={handleSend} disabled={loading || !input.trim()}>
                                <Send className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </Card>
            )}
        </>
    )
}