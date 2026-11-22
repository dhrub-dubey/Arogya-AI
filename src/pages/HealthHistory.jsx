import React from 'react';
import { db } from '@/api/db';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, MessageCircle, Stethoscope, FileText } from 'lucide-react';
import GlassCard from '@/components/ui/GlassCard';
import LoadingSkeleton from '@/components/ui/LoadingSkeleton';
import SwipeableHistoryItem from '@/components/history/SwipeableHistoryItem';
import { useLang } from '@/lib/LanguageContext';

function groupByMonth(items) {
  const groups = {};
  items.forEach(item => {
    const d = new Date(item.date);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(item);
  });
  // Return sorted descending by month
  return Object.values(groups).sort((a, b) => new Date(b.items[0].date) - new Date(a.items[0].date));
}

export default function HealthHistory() {
  const { t } = useLang();
  const { user } = useOutletContext();
  const queryClient = useQueryClient();

  const { data: chats = [], isLoading: loadingChats } = useQuery({
    queryKey: ['history-chats', user?.id],
    queryFn: () => db.ChatMessage.filter({ role: 'user', user_id: user?.id }, '-created_at', 50),
    enabled: !!user?.id,
  });

  const { data: symptoms = [], isLoading: loadingSymptoms } = useQuery({
    queryKey: ['history-symptoms', user?.id],
    queryFn: () => db.SymptomCheck.filter({ user_id: user?.id }, '-created_at', 50),
    enabled: !!user?.id,
  });

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ['history-reports', user?.id],
    queryFn: () => db.HealthReport.filter({ user_id: user?.id }, '-created_at', 50),
    enabled: !!user?.id,
  });

  const deleteChat = useMutation({
    mutationFn: (id) => db.ChatMessage.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-chats'] }),
  });

  const deleteSymptom = useMutation({
    mutationFn: (id) => db.SymptomCheck.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-symptoms'] }),
  });

  const deleteReport = useMutation({
    mutationFn: (id) => db.HealthReport.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history-reports'] }),
  });

  const isLoading = loadingChats || loadingSymptoms || loadingReports;

  const riskLabel = (level) => {
    if (level === 'high') return t('highRisk');
    if (level === 'moderate') return t('moderateRisk');
    return t('lowRisk');
  };

  const riskClass = (level) =>
    level === 'high' ? 'bg-red-500/10 text-red-600' :
    level === 'moderate' ? 'bg-amber-500/10 text-amber-600' :
    'bg-emerald-500/10 text-emerald-600';

  const timeline = [
    ...chats.map(c => ({ id: c.id, type: 'chat', typeLabel: t('chat'), date: c.created_at, title: c.content?.slice(0, 60), icon: MessageCircle, color: 'text-blue-500 bg-blue-500/10', onDelete: () => deleteChat.mutate(c.id) })),
    ...symptoms.map(s => ({ id: s.id, type: 'symptom', typeLabel: t('symptom'), date: s.created_at, title: s.symptoms?.slice(0, 60), icon: Stethoscope, color: 'text-emerald-500 bg-emerald-500/10', riskLevel: s.risk_level, onDelete: () => deleteSymptom.mutate(s.id) })),
    ...reports.map(r => ({ id: r.id, type: 'report', typeLabel: t('report'), date: r.created_at, title: r.title, icon: FileText, color: 'text-violet-500 bg-violet-500/10', onDelete: () => deleteReport.mutate(r.id) })),
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const monthGroups = groupByMonth(timeline);

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">{t('healthHistoryTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('healthHistorySubtitle')}</p>
          </div>
        </div>
      </motion.div>

      {isLoading ? <LoadingSkeleton rows={5} /> : (
        <div className="space-y-8">
          {monthGroups.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">{t('noHistory')}</p>
          )}
          {monthGroups.map(group => (
            <div key={group.label}>
              {/* Month header */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">{group.label}</span>
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted-foreground">{group.items.length} records</span>
              </div>

              {/* Timeline items */}
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-3">
                  {group.items.map((item, i) => {
                    const Icon = item.icon;
                    return (
                      <div key={`${item.type}-${item.id}`} className="ml-10 relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-[2.85rem] top-4 h-8 w-8 rounded-full border-2 border-background flex items-center justify-center bg-card z-10">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center ${item.color}`}>
                            <Icon className="h-3 w-3" />
                          </div>
                        </div>

                        <SwipeableHistoryItem onDelete={item.onDelete}>
                          <GlassCard delay={i * 0.02}>
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-muted-foreground uppercase">{item.typeLabel}</p>
                                <p className="text-sm mt-1 truncate pr-2">{item.title}</p>
                              </div>
                              <p className="text-[10px] text-muted-foreground whitespace-nowrap ml-3 flex-shrink-0">
                                {item.date ? new Date(item.date).toLocaleDateString() : ''}
                              </p>
                            </div>
                            {item.riskLevel && (
                              <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-semibold ${riskClass(item.riskLevel)}`}>
                                {riskLabel(item.riskLevel)}
                              </span>
                            )}
                          </GlassCard>
                        </SwipeableHistoryItem>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}