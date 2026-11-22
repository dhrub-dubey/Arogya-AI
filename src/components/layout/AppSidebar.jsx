import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, MessageCircle, Stethoscope, BookOpen,
  FileText, Phone, MapPin, Pill, Clock, Settings, X, Heart, FlaskConical
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLang } from '@/lib/LanguageContext';

export default function AppSidebar({ isOpen, onClose }) {
  const location = useLocation();
  const { t } = useLang();

  const navItems = [
    { path: '/', label: t('dashboard'), icon: LayoutDashboard },
    { path: '/chat', label: t('aiChat'), icon: MessageCircle },
    { path: '/symptoms', label: t('symptomChecker'), icon: Stethoscope },
    { path: '/diseases', label: t('diseaseInformation'), icon: BookOpen },
    { path: '/medicine-consultation', label: t('medicineConsultation'), icon: FlaskConical },
    { path: '/reports', label: t('healthReports'), icon: FileText },
    { path: '/emergency', label: t('emergencyContacts'), icon: Phone },
    { path: '/hospitals', label: t('nearbyHospitals'), icon: MapPin },
    { path: '/medicines', label: t('medicineReminder'), icon: Pill },
    { path: '/history', label: t('healthHistory'), icon: Clock },
    { path: '/settings', label: t('settings'), icon: Settings },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
            onClick={onClose}
          />
          <motion.aside
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 w-[min(18rem,85vw)] bg-card z-50 shadow-2xl flex flex-col pt-safe pb-safe"
          >
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                  <Heart className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-heading font-bold text-sm">{t('appName')}</p>
                  <p className="text-xs text-muted-foreground">{t('tagline')}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={onClose} className="rounded-xl">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {navItems.map(({ path, label, icon: Icon }) => {
                const isActive = location.pathname === path;
                return (
                  <Link
                    key={path}
                    to={path}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                      isActive
                        ? 'bg-primary/10 text-primary shadow-sm'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-5 w-5 flex-shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </nav>
            <div className="p-4 border-t border-border">
              <div className="glass-card rounded-xl p-3 text-center">
                <p className="text-xs text-muted-foreground">{t('version')}</p>
                <p className="text-xs font-medium text-primary">{t('appName')}</p>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}