import React, { useState } from 'react';
import { runAI } from '@/api/ai';
import { useToast } from '@/components/ui/use-toast';
import SourcesList from '@/components/SourcesList';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, FlaskConical, Loader2, Pill, Info, AlertCircle, Layers } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import GlassCard from '@/components/ui/GlassCard';
import { useLang } from '@/lib/LanguageContext';
import ReactMarkdown from 'react-markdown';

export default function MedicineConsultation() {
  const { t, lang } = useLang();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState(null);
  const { toast } = useToast();

  const search = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setResult(null);
    try {
      setResult(await runAI('medicine', { query, lang }));
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <FlaskConical className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">Medicine Consultation</h2>
            <p className="text-sm text-muted-foreground">Composition, dosage & alternatives</p>
          </div>
        </div>
      </motion.div>

      <GlassCard delay={0.1}>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="Enter medicine name (e.g., Paracetamol, Amoxicillin...)"
              className="pl-10 rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>
          <Button
            onClick={search}
            disabled={isLoading || !query.trim()}
            className="rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 hover:opacity-90 shadow-lg shadow-indigo-500/25"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look Up'}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {['Paracetamol', 'Ibuprofen', 'Amoxicillin', 'Metformin', 'Aspirin'].map(m => (
            <button
              key={m}
              onClick={() => setQuery(m)}
              className="text-xs px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              {m}
            </button>
          ))}
        </div>
      </GlassCard>

      {isLoading && (
        <GlassCard>
          <div className="flex items-center gap-3 py-4 justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Looking up medicine information...</span>
          </div>
        </GlassCard>
      )}

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">

            {/* Name & Composition */}
            <GlassCard>
              <div className="flex items-center gap-2 mb-3">
                <Pill className="h-5 w-5 text-indigo-500" />
                <h3 className="font-heading font-bold text-lg">{result.medicine_name}</h3>
              </div>
              <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                <p className="text-xs font-semibold text-indigo-600 mb-1">COMPOSITION</p>
                <p className="text-sm">{result.composition}</p>
              </div>
            </GlassCard>

            {/* Dosage */}
            <GlassCard delay={0.05}>
              <div className="flex items-center gap-2 mb-3">
                <Info className="h-5 w-5 text-blue-500" />
                <h3 className="font-heading font-semibold">Recommended Dosage</h3>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                <ReactMarkdown>{result.recommended_dosage}</ReactMarkdown>
              </div>
            </GlassCard>

            {/* Used For */}
            <GlassCard delay={0.08}>
              <h3 className="font-heading font-semibold mb-3">Used For</h3>
              <div className="flex flex-wrap gap-2">
                {result.used_for?.map((use, i) => (
                  <span key={i} className="text-xs px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 font-medium">{use}</span>
                ))}
              </div>
            </GlassCard>

            {/* Similar Medicines */}
            {result.similar_medicines?.length > 0 && (
              <GlassCard delay={0.11}>
                <div className="flex items-center gap-2 mb-3">
                  <Layers className="h-5 w-5 text-violet-500" />
                  <h3 className="font-heading font-semibold">Similar Medicines</h3>
                </div>
                <div className="space-y-2">
                  {result.similar_medicines.map((med, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{med.name}</p>
                        <p className="text-xs text-muted-foreground">{med.composition}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </GlassCard>
            )}

            {/* Precautions */}
            {result.precautions && (
              <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-amber-700 mb-1">PRECAUTIONS</p>
                  <div className="text-xs text-amber-800 dark:text-amber-200 prose prose-xs dark:prose-invert max-w-none [&_*]:text-amber-800 dark:[&_*]:text-amber-200"><ReactMarkdown>{result.precautions}</ReactMarkdown></div>
                </div>
              </div>
            )}

            <SourcesList sources={result.sources} />

            <div className="flex items-start gap-2 p-4 rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-800 dark:text-blue-200">This is general information only. Always consult a doctor or pharmacist before taking any medication.</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}