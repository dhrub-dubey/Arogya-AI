import React, { useState } from 'react';
import { db } from '@/api/db';
import { runAI } from '@/api/ai';
import { useToast } from '@/components/ui/use-toast';
import VoiceInputButton from '@/components/VoiceInputButton';
import { motion, AnimatePresence } from 'framer-motion';
import { Stethoscope, AlertTriangle, ChevronRight, Loader2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import GlassCard from '@/components/ui/GlassCard';
import ReactMarkdown from 'react-markdown';
import { useLang } from '@/lib/LanguageContext';

const riskColors = {
  low: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  moderate: 'bg-amber-500/10 text-amber-700 border-amber-200',
  high: 'bg-red-500/10 text-red-700 border-red-200',
};

export default function SymptomChecker() {
  const { t, lang } = useLang();
  const [symptoms, setSymptoms] = useState('');
  const [duration, setDuration] = useState('');
  const [severity, setSeverity] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const { toast } = useToast();

  const analyze = async () => {
    setIsAnalyzing(true);
    try {
      const analysis = await runAI('symptoms', { symptoms, duration, severity, lang });
      setResult(analysis);
      // Saving to history should never block showing the result.
      db.SymptomCheck.create({
        symptoms, duration, severity,
        analysis: analysis.analysis_text,
        risk_level: analysis.risk_level,
        possible_conditions: analysis.possible_conditions ?? [],
        recommendations: analysis.recommendations ?? [],
        when_to_seek_help: analysis.when_to_seek_help,
      }).catch((err) => console.error('Could not save symptom check', err));
    } catch (err) {
      toast({ title: err.message, variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-primary to-emerald-500 flex items-center justify-center shadow-lg shadow-primary/20">
            <Stethoscope className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">{t('symptomCheckerTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('symptomCheckerSubtitle')}</p>
          </div>
        </div>
      </motion.div>

      <GlassCard delay={0.1}>
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-1.5 block">{t('describeSymptoms')}</label>
            <div className="relative">
              <Textarea
                value={symptoms}
                onChange={e => setSymptoms(e.target.value)}
                placeholder={t('symptomsPlaceholder')}
                className="rounded-xl bg-muted/50 border-0 min-h-[100px] resize-none focus-visible:ring-1 pr-12"
              />
              <VoiceInputButton
                className="absolute right-1.5 bottom-1.5"
                onText={(text) => setSymptoms((prev) => (prev ? `${prev.trim()} ${text}` : text))}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('duration')}</label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger className="rounded-xl bg-muted/50 border-0">
                  <SelectValue placeholder={t('howLong')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="few_hours">{t('fewHours')}</SelectItem>
                  <SelectItem value="1_day">{t('oneDay')}</SelectItem>
                  <SelectItem value="2-3_days">{t('twoDays')}</SelectItem>
                  <SelectItem value="1_week">{t('oneWeek')}</SelectItem>
                  <SelectItem value="more_than_week">{t('moreThanWeek')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">{t('severity')}</label>
              <Select value={severity} onValueChange={setSeverity}>
                <SelectTrigger className="rounded-xl bg-muted/50 border-0">
                  <SelectValue placeholder={t('howSevere')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mild">{t('mild')}</SelectItem>
                  <SelectItem value="moderate">{t('moderate')}</SelectItem>
                  <SelectItem value="severe">{t('severe')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={analyze}
            disabled={!symptoms.trim() || isAnalyzing}
            className="w-full rounded-xl bg-gradient-to-r from-primary to-emerald-500 hover:opacity-90 shadow-lg shadow-primary/25 h-12"
          >
            {isAnalyzing
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t('analyzing')}</>
              : <><Stethoscope className="h-4 w-4 mr-2" />{t('analyzeSymptoms')}</>
            }
          </Button>
        </div>
      </GlassCard>

      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-4">
            <GlassCard>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-heading font-semibold">{t('riskAssessment')}</h3>
                <Badge className={`${riskColors[result.risk_level]} border rounded-lg px-3 py-1 font-semibold`}>
                  {result.risk_level?.toUpperCase()}
                </Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{result.analysis_text}</ReactMarkdown>
              </div>
            </GlassCard>

            <GlassCard delay={0.1}>
              <h3 className="font-heading font-semibold mb-3">{t('possibleConditions')}</h3>
              <div className="space-y-2">
                {result.possible_conditions?.map((condition, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                    <ChevronRight className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">{condition}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard delay={0.15}>
              <h3 className="font-heading font-semibold mb-3">{t('recommendations')}</h3>
              <div className="space-y-2">
                {result.recommendations?.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
                    <Shield className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{rec}</span>
                  </div>
                ))}
              </div>
            </GlassCard>

            {result.when_to_seek_help && (
              <GlassCard delay={0.2} className="border-red-200 dark:border-red-900">
                <h3 className="font-heading font-semibold mb-2 flex items-center gap-2">
                  {t('whenToSeekHelp')}
                </h3>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{result.when_to_seek_help}</ReactMarkdown>
                </div>
              </GlassCard>
            )}

            <div className="flex items-start gap-2 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">{t('disclaimer')}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}