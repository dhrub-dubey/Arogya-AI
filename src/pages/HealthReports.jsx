import React, { useState } from 'react';
import { db, uploadReportFile } from '@/api/db';
import { runAI } from '@/api/ai';
import { useToast } from '@/components/ui/use-toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, Upload, Loader2, AlertCircle, CheckCircle, ChevronRight, ArrowRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import GlassCard from '@/components/ui/GlassCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import ReactMarkdown from 'react-markdown';
import { useLang } from '@/lib/LanguageContext';

export default function HealthReports() {
  const { t, lang } = useLang();
  const { user } = useOutletContext();
  const [isUploading, setIsUploading] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ['reports', user?.id],
    queryFn: () => db.HealthReport.filter({ user_id: user?.id }, '-created_at', 20),
    enabled: !!user?.id,
  });

  const uploadReport = async (e) => {
    const input = e.target;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast({ title: 'Please upload a file smaller than 20 MB.', variant: 'destructive' });
      input.value = '';
      return;
    }
    setIsUploading(true);
    try {
      const path = await uploadReportFile(file, user.id);
      const analysis = await runAI('report', { path, lang });
      const saved = await db.HealthReport.create({
        title: file.name,
        file_path: path,
        file_type: file.type.includes('pdf') ? 'pdf' : 'image',
        summary: analysis.summary,
        key_findings: analysis.key_findings ?? [],
        risk_factors: analysis.risk_factors ?? [],
        suggested_actions: analysis.suggested_actions ?? [],
      });
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      setSelectedReport(saved); // open the new analysis straight away
    } catch (err) {
      toast({ title: err.message || 'Could not analyse this report.', variant: 'destructive' });
    } finally {
      setIsUploading(false);
      input.value = ''; // allow choosing the same file again
    }
  };

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">{t('healthReportsTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('healthReportsSubtitle')}</p>
          </div>
        </div>
      </motion.div>

      <GlassCard delay={0.1}>
        <label className="flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-primary/50 transition-colors">
          {isUploading ? (
            <><Loader2 className="h-8 w-8 text-primary animate-spin" /><p className="text-sm text-muted-foreground">{t('analyzingReport')}</p></>
          ) : (
            <><Upload className="h-8 w-8 text-muted-foreground" /><p className="text-sm text-muted-foreground">{t('uploadReport')}</p></>
          )}
          <Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={uploadReport} disabled={isUploading} />
        </label>
      </GlassCard>

      {isLoading ? <LoadingSkeleton rows={3} /> : (
        <div className="space-y-3">
          {reports.map((report, i) => (
            <GlassCard key={report.id} delay={i * 0.05} onClick={() => setSelectedReport(selectedReport?.id === report.id ? null : report)}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                    <FileText className="h-5 w-5 text-violet-600" />
                  </div>
                  <div>
                    <p className="font-medium text-sm truncate max-w-[200px]">{report.title}</p>
                    <p className="text-xs text-muted-foreground">{new Date(report.created_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${selectedReport?.id === report.id ? 'rotate-90' : ''}`} />
              </div>
              <AnimatePresence>
                {selectedReport?.id === report.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="mt-4 pt-4 border-t border-border space-y-3">
                      {report.summary && (
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown>{report.summary}</ReactMarkdown>
                        </div>
                      )}
                      {report.key_findings?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">{t('keyFindings')}</p>
                          {report.key_findings.map((f, j) => (
                            <div key={j} className="flex items-start gap-2 mb-1.5">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{f}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {report.risk_factors?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">{t('riskFactorsLabel')}</p>
                          {report.risk_factors.map((f, j) => (
                            <div key={j} className="flex items-start gap-2 mb-1.5">
                              <AlertCircle className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{f}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {report.suggested_actions?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground mb-2">{t('suggestedActionsLabel')}</p>
                          {report.suggested_actions.map((f, j) => (
                            <div key={j} className="flex items-start gap-2 mb-1.5">
                              <ArrowRight className="h-3.5 w-3.5 text-primary mt-0.5 flex-shrink-0" />
                              <span className="text-sm">{f}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          ))}
          {reports.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('noReports')}</p>
          )}
        </div>
      )}
    </div>
  );
}