import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { MessageCircle, FileText, Pill, Clock } from 'lucide-react';
import { db } from '@/api/db';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/LanguageContext';

// The signed-in user's real numbers (every table is limited to their own rows).
async function loadStats() {
  const [chats, reports, medicines, lastCheck] = await Promise.all([
    db.ChatMessage.count({ role: 'user' }),
    db.HealthReport.count(),
    db.MedicineReminder.count({ is_active: true }),
    db.SymptomCheck.list('-created_at', 1),
  ]);
  return { chats, reports, medicines, lastCheckAt: lastCheck[0]?.created_at ?? null };
}

export default function QuickStats() {
  const { t } = useLang();
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-stats', user?.id],
    queryFn: loadStats,
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const lastCheck = (() => {
    if (!data?.lastCheckAt) return t('never');
    const days = Math.floor((Date.now() - new Date(data.lastCheckAt).getTime()) / 86_400_000);
    return days <= 0 ? t('today') : t('daysAgoN').replace('{n}', days);
  })();

  const stats = [
    { label: t('chatsStat'), value: data?.chats, icon: MessageCircle, color: 'text-emerald-500', to: '/chat' },
    { label: t('reports'), value: data?.reports, icon: FileText, color: 'text-blue-500', to: '/reports' },
    { label: t('activeMedicines'), value: data?.medicines, icon: Pill, color: 'text-violet-500', to: '/medicines' },
    { label: t('lastCheck'), value: lastCheck, icon: Clock, color: 'text-amber-500', to: '/symptoms' },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, color, to }, i) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.05 }}
        >
          <Link to={to} className="block glass-card rounded-2xl p-4 text-center active:scale-[0.98] transition-transform">
            <Icon className={`h-5 w-5 mx-auto ${color}`} />
            <p className="font-heading font-bold text-lg mt-1 min-h-[1.75rem]">
              {isLoading ? <span className="inline-block h-5 w-8 rounded bg-muted animate-pulse align-middle" /> : value}
            </p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
