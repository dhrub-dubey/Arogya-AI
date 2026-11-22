import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, MessageCircle, Stethoscope, MapPin, Settings } from 'lucide-react';
import { useLang } from '@/lib/LanguageContext';

/** Phone-style tab bar, shown on small screens only. Everything else is in the ☰ menu. */
export default function BottomNav() {
  const { pathname } = useLocation();
  const { t } = useLang();

  const tabs = [
    { path: '/', label: t('navHome'), icon: LayoutDashboard },
    { path: '/chat', label: t('navChat'), icon: MessageCircle },
    { path: '/symptoms', label: t('navSymptoms'), icon: Stethoscope },
    { path: '/hospitals', label: t('navHospitals'), icon: MapPin },
    { path: '/settings', label: t('settings'), icon: Settings },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-border/50 pb-safe"
      aria-label="Main"
    >
      <div className="grid grid-cols-5 h-16">
        {tabs.map(({ path, label, icon: Icon }) => {
          const active = pathname === path;
          return (
            <Link
              key={path}
              to={path}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <span className={`flex items-center justify-center h-7 w-12 rounded-full transition-colors ${active ? 'bg-primary/15' : ''}`}>
                <Icon className="h-5 w-5" />
              </span>
              <span className="truncate max-w-full px-1">{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
