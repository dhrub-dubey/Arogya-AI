import React, { useState, useRef, useEffect } from 'react';
import { db } from '@/api/db';
import { streamChat } from '@/api/ai';
import VoiceInputButton from '@/components/VoiceInputButton';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Heart, Copy, Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import ReactMarkdown from 'react-markdown';
import { useLang } from '@/lib/LanguageContext';
import { useOutletContext, useSearchParams } from 'react-router-dom';

function TypingIndicator({ label }) {
  return (
    <div className="flex items-center gap-1 px-4 py-3">
      <div className="flex items-center gap-1">
        {[0, 1, 2].map(i => (
          <motion.div
            key={i}
            className="h-2 w-2 rounded-full bg-primary/50"
            animate={{ y: [0, -6, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground ml-2">{label}</span>
    </div>
  );
}

const SPEECH_LANG = { en: 'en-IN', hi: 'hi-IN', bn: 'bn-IN' };

function ChatBubble({ message, onCopy, lang }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}
    >
      {!isUser && (
        <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mr-2 mt-1 flex-shrink-0">
          <Heart className="h-4 w-4 text-white" />
        </div>
      )}
      <div className="max-w-[88%] sm:max-w-[80%] min-w-0 group relative">
        <div className={`rounded-2xl px-4 py-3 ${
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'glass-card rounded-bl-md'
        }`}>
          {isUser ? (
            <p className="text-sm leading-relaxed">{message.content}</p>
          ) : (
            <ReactMarkdown className="text-sm prose prose-sm prose-slate dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
              {message.content}
            </ReactMarkdown>
          )}
        </div>
        {!isUser && (
          <div className="flex gap-1 mt-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" aria-label="Copy" className="h-8 w-8 rounded-lg" onClick={() => onCopy(message.content)}>
              <Copy className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Read aloud" className="h-8 w-8 rounded-lg" onClick={() => {
              if ('speechSynthesis' in window) {
                speechSynthesis.cancel();
                const plain = message.content.replace(/[#*_`>|-]+/g, ' ');
                const utter = new SpeechSynthesisUtterance(plain);
                utter.lang = SPEECH_LANG[lang] || 'en-IN';
                speechSynthesis.speak(utter);
              }
            }}>
              <Volume2 className="h-3 w-3" />
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          {message.created_at
            ? new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : 'now'}
        </p>
      </div>
    </motion.div>
  );
}

export default function AIChat() {
  const { t, lang } = useLang();
  const { user } = useOutletContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [input, setInput] = useState(() => searchParams.get('q') || '');
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingUserMessage, setPendingUserMessage] = useState(null);
  // Keep the same conversation while the tab is open, so leaving the page doesn't wipe it.
  const [conversationId] = useState(() => {
    try {
      const saved = sessionStorage.getItem('arogya_conversation_id');
      if (saved) return saved;
      const id = `conv_${Date.now()}`;
      sessionStorage.setItem('arogya_conversation_id', id);
      return id;
    } catch {
      return `conv_${Date.now()}`;
    }
  });
  const scrollRef = useRef(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: messages = [] } = useQuery({
    queryKey: ['chat', conversationId, user?.id],
    queryFn: () => db.ChatMessage.filter({ conversation_id: conversationId }, 'created_at', 100),
    enabled: !!user?.id,
    refetchInterval: false,
  });

  // A question passed in the link (e.g. from the dashboard) is put in the box once.
  useEffect(() => {
    if (searchParams.get('q')) setSearchParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isTyping, streamingText, pendingUserMessage]);

  const sendMessage = useMutation({
    mutationFn: async (text) => {
      const history = [...messages, { role: 'user', content: text }]
        .map(({ role, content }) => ({ role, content }));
      setPendingUserMessage({ id: 'pending-user', role: 'user', content: text, created_at: new Date().toISOString() });
      setIsTyping(true);
      setStreamingText('');

      // Save the question while the answer streams in.
      const savingUserMessage = db.ChatMessage
        .create({ role: 'user', content: text, conversation_id: conversationId, language: lang })
        .catch((err) => console.error('Could not save message', err));

      try {
        const reply = await streamChat({
          messages: history,
          lang,
          onToken: (soFar) => {
            setIsTyping(false);
            setStreamingText(soFar);
          },
        });
        await savingUserMessage;
        await db.ChatMessage.create({ role: 'assistant', content: reply, conversation_id: conversationId, language: lang });
      } finally {
        await savingUserMessage;
        await queryClient.invalidateQueries({ queryKey: ['chat', conversationId] });
        setIsTyping(false);
        setStreamingText('');
        setPendingUserMessage(null);
      }
    },
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const handleSend = () => {
    if (!input.trim() || sendMessage.isPending) return;
    const text = input.trim();
    setInput('');
    sendMessage.mutate(text);
  };

  const handleCopy = (content) => {
    navigator.clipboard.writeText(content);
    toast({ title: t('copiedToClipboard') });
  };

  const suggestedQuestions = [t('suggestedQ1'), t('suggestedQ2'), t('suggestedQ3')];

  return (
    <div className="fixed inset-x-0 bottom-0 top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-[calc(4rem+env(safe-area-inset-top))] z-30 flex flex-col max-w-5xl mx-auto bg-background">
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4 space-y-1">
        {messages.length === 0 && !pendingUserMessage && (
          <div className="flex flex-col items-center justify-center h-full text-center px-8">
            <div className="h-16 w-16 rounded-3xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
              <Heart className="h-8 w-8 text-white" />
            </div>
            <h3 className="font-heading font-bold text-lg">{t('aiChatTitle')}</h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-sm">{t('aiChatSubtitle')}</p>
            <div className="flex flex-wrap gap-2 mt-4 justify-center">
              {suggestedQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="text-xs px-3 py-2 rounded-xl glass-card text-muted-foreground hover:text-foreground transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence>
          {(pendingUserMessage ? [...messages, pendingUserMessage] : messages).map(msg => (
            <ChatBubble key={msg.id} message={msg} onCopy={handleCopy} lang={lang} />
          ))}
          {streamingText && (
            <ChatBubble key="streaming" message={{ role: 'assistant', content: streamingText }} onCopy={handleCopy} lang={lang} />
          )}
        </AnimatePresence>
        {isTyping && <TypingIndicator label={t('aiIsThinking')} />}
      </div>

      <div className="px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] border-t border-border glass">
        <div className="flex items-center gap-2 max-w-3xl mx-auto">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder={t('askAboutHealth')}
            enterKeyHint="send"
            className="rounded-xl bg-muted/50 border-0 focus-visible:ring-1 h-11"
          />
          <VoiceInputButton
            disabled={sendMessage.isPending}
            onText={(text) => setInput((prev) => (prev ? `${prev.trim()} ${text}` : text))}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || sendMessage.isPending}
            size="icon"
            aria-label="Send"
            className="rounded-xl bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 flex-shrink-0 h-11 w-11"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}