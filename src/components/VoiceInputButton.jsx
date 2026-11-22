import React from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useLang } from '@/lib/LanguageContext';
import { useVoiceInput } from '@/hooks/use-voice-input';

/** Mic button: tap to speak, tap again to stop. Calls onText with the transcript. */
export default function VoiceInputButton({ onText, className = '', disabled = false }) {
  const { lang } = useLang();
  const { toast } = useToast();
  const { status, seconds, maxSeconds, toggle } = useVoiceInput({
    lang,
    onText,
    onError: (err) => toast({ title: err.message, variant: 'destructive' }),
  });

  const recording = status === 'recording';
  const busy = status === 'transcribing';

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      disabled={disabled || busy}
      aria-label={recording ? 'Stop recording' : 'Speak'}
      title={recording ? `Recording… ${maxSeconds - seconds}s left. Tap to stop.` : 'Speak'}
      className={`relative rounded-xl flex-shrink-0 ${recording ? 'text-red-500 bg-red-500/10' : 'text-muted-foreground'} ${className}`}
    >
      {busy ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : recording ? (
        <>
          <span className="absolute inset-0 rounded-xl bg-red-500/20 animate-ping" />
          <Square className="h-4 w-4 fill-current" />
        </>
      ) : (
        <Mic className="h-5 w-5" />
      )}
    </Button>
  );
}
