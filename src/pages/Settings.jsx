import React, { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, Moon, Sun, LogOut } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import GlassCard from '@/components/ui/GlassCard';
import { useLang } from '@/lib/LanguageContext';
import { languageNames } from '@/lib/i18n';

export default function Settings() {
  const { t, lang, setLang } = useLang();
  const { logout } = useAuth();
  const [darkMode, setDarkMode] = useState(false);

  useEffect(() => {
    setDarkMode(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleDark = (val) => {
    setDarkMode(val);
    document.documentElement.classList.toggle('dark', val);
    try { localStorage.setItem('theme', val ? 'dark' : 'light'); } catch { /* private mode */ }
  };

  return (
    <div className="p-4 space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-slate-500 to-gray-500 flex items-center justify-center shadow-lg shadow-slate-500/20">
            <SettingsIcon className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-xl">{t('settingsTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('settingsSubtitle')}</p>
          </div>
        </div>
      </motion.div>

      <GlassCard delay={0.05}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {darkMode ? <Moon className="h-5 w-5 text-violet-500" /> : <Sun className="h-5 w-5 text-amber-500" />}
            <div>
              <p className="font-medium text-sm">{t('darkMode')}</p>
              <p className="text-xs text-muted-foreground">{t('darkModeDesc')}</p>
            </div>
          </div>
          <Switch checked={darkMode} onCheckedChange={toggleDark} />
        </div>
      </GlassCard>

      {/* Language selection — full cards for each language */}
      <div>
        <p className="font-heading font-semibold text-sm text-muted-foreground mb-3 px-1">{t('language').toUpperCase()}</p>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(languageNames).map(([code, name]) => (
            <motion.button
              key={code}
              whileTap={{ scale: 0.97 }}
              onClick={() => setLang(code)}
              className={`p-4 rounded-2xl border-2 transition-all font-medium text-sm ${
                lang === code
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border glass-card text-muted-foreground hover:border-primary/30'
              }`}
            >
              {name}
            </motion.button>
          ))}
        </div>
      </div>

      <GlassCard delay={0.15} onClick={() => logout('/login')} className="hover:border-destructive/30">
        <div className="flex items-center gap-3">
          <LogOut className="h-5 w-5 text-destructive" />
          <div>
            <p className="font-medium text-sm text-destructive">{t('logOut')}</p>
            <p className="text-xs text-muted-foreground">{t('logOutDesc')}</p>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}