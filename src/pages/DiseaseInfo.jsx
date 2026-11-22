import React, { useState } from 'react';
import { runAI } from '@/api/ai';
import { useToast } from '@/components/ui/use-toast';
import SourcesList from '@/components/SourcesList';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, BookOpen, Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import GlassCard from '@/components/ui/GlassCard';
import ReactMarkdown from 'react-markdown';
import { useLang } from '@/lib/LanguageContext';

export default function DiseaseInfo() {
  const { t, lang } = useLang();
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [diseaseData, setDiseaseData] = useState(null);
  const { toast } = useToast();

  const searchDisease = async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    try {
      setDiseaseData(await runAI('disease', { query, lang }));
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const sections = diseaseData ? [
    { key: 'overview', title: t('overview'), content: diseaseData.overview },
    { key: 'symptoms', title: t('symptoms'), content: diseaseData.symptoms },
    { key: 'causes', title: t('causes'), content: diseaseData.causes },
    { key: 'risk_factors', title: t('riskFactors'), content: diseaseData.risk_factors },
    { key: 'prevention', title: t('prevention'), content: diseaseData.prevention },
    { key: 'treatment', title: t('treatment'), content: diseaseData.treatment },
    { key: 'when_to_seek_help', title: t('whenToSeekHelp'), content: diseaseData.when_to_seek_help },
  ] : [];

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <BookOpen className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">{t('diseaseInfoTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('diseaseInfoSubtitle')}</p>
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
              onKeyDown={e => e.key === 'Enter' && searchDisease()}
              placeholder={t('searchDiseases')}
              className="pl-10 rounded-xl bg-muted/50 border-0 focus-visible:ring-1"
            />
          </div>
          <Button
            onClick={searchDisease}
            disabled={isLoading || !query.trim()}
            className="rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 hover:opacity-90 shadow-lg shadow-blue-500/25"
          >
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : t('search')}
          </Button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {['Diabetes', 'Hypertension', 'Migraine', 'Asthma', 'Flu'].map(d => (
            <button
              key={d}
              onClick={() => setQuery(d)}
              className="text-xs px-3 py-1.5 rounded-lg bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
            >
              {d}
            </button>
          ))}
        </div>
      </GlassCard>

      <AnimatePresence>
        {diseaseData && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <GlassCard>
              <h3 className="font-heading font-bold text-xl mb-4">{diseaseData.name}</h3>
              <Accordion type="multiple" defaultValue={['overview', 'symptoms']} className="space-y-2">
                {sections.map(({ key, title, content }) => (
                  <AccordionItem key={key} value={key} className="border rounded-xl px-4 bg-muted/30 border-border/50">
                    <AccordionTrigger className="text-sm font-semibold hover:no-underline py-3">
                      {title}
                    </AccordionTrigger>
                    <AccordionContent className="pb-4">
                      <div className="prose prose-sm dark:prose-invert max-w-none text-muted-foreground">
                        <ReactMarkdown>{content}</ReactMarkdown>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
              <div className="mt-4">
                <SourcesList sources={diseaseData.sources} />
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}