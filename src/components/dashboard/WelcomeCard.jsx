import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Smile, Meh, Frown, AlertTriangle } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

/**
 * @param {{ userName?: string }} props
 */
export default function WelcomeCard({ userName }) {
  const { t } = useLang();
  const navigate = useNavigate();
  const firstName = userName ? userName.split(' ')[0] : '';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('goodMorning') : hour < 18 ? t('goodAfternoon') : t('goodEvening');

  const moods = [
    { label: t('moodGood'), icon: Smile, value: 'good', to: `/chat?q=${encodeURIComponent(t('suggestedQ3'))}` },
    { label: t('moodOkay'), icon: Meh, value: 'okay', to: `/chat?q=${encodeURIComponent(t('suggestedQ2'))}` },
    { label: t('moodUnwell'), icon: Frown, value: 'unwell', to: '/symptoms' },
    { label: t('moodEmergency'), icon: AlertTriangle, value: 'emergency', to: '/emergency' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-secondary p-6 text-white shadow-xl shadow-primary/20"
    >
      <div className="absolute -right-6 -top-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -left-4 -bottom-4 h-24 w-24 rounded-full bg-white/10 blur-xl" />
      <div className="relative">
        <p className="text-white/80 text-sm font-medium">{greeting}</p>
        <h2 className="font-heading text-2xl font-bold mt-1">{firstName} 👋</h2>
        <p className="text-white/70 mt-2 text-sm">{t('howAreYouFeeling')}</p>
        <div className="flex gap-2 mt-4 flex-wrap">
          {moods.map(({ label, icon: Icon, value, to }) => (
            <motion.button
              key={value}
              type="button"
              onClick={() => navigate(to)}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/15 backdrop-blur-sm text-white text-sm font-medium hover:bg-white/25 transition-colors"
            >
              <Icon className="h-4 w-4" />
              {label}
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}