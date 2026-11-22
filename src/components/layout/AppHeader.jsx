import React from 'react';
import { Link } from 'react-router-dom';
import { Menu, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { motion } from 'framer-motion';
import { useLang } from '@/lib/LanguageContext';
import LanguageSwitcher from '@/components/ui/LanguageSwitcher';

export default function AppHeader({ onMenuToggle, user }) {
  const { t } = useLang();

  const fullName = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  const initials = (fullName || user?.email || 'U')
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();

  return (
    <header className="sticky top-0 z-40 glass border-b border-border/50 pt-safe">
      <div className="flex items-center justify-between gap-2 px-2 sm:px-4 h-14 sm:h-16">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuToggle}
            aria-label="Open menu"
            className="rounded-xl hover:bg-primary/10 flex-shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <Link to="/" className="flex items-center gap-2 min-w-0">
            <span className="text-xl flex-shrink-0">💊</span>
            <h1 className="font-heading font-bold text-base sm:text-lg truncate bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
              {t('appName')}
            </h1>
          </Link>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          <LanguageSwitcher />
          <motion.a
            href="tel:112"
            whileTap={{ scale: 0.9 }}
            aria-label={`${t('sos')}: call 112`}
            className="flex items-center gap-1.5 bg-destructive text-destructive-foreground h-10 px-3 rounded-xl text-sm font-semibold shadow-lg shadow-destructive/25 hover:shadow-destructive/40 transition-shadow"
          >
            <Phone className="h-4 w-4" />
            <span className="hidden sm:inline">{t('sos')}</span>
          </motion.a>
          <Link to="/settings" aria-label={t('settings')} className="hidden sm:block">
            <Avatar className="h-9 w-9 border-2 border-primary/20">
              <AvatarFallback className="bg-primary/10 text-primary font-semibold text-sm">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Link>
        </div>
      </div>
    </header>
  );
}
