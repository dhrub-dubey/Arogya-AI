import React from 'react';
import { useOutletContext } from 'react-router-dom';
import WelcomeCard from '@/components/dashboard/WelcomeCard';
import ServiceGrid from '@/components/dashboard/ServiceGrid';
import QuickStats from '@/components/dashboard/QuickStats';
import { useLang } from '@/lib/LanguageContext';

export default function Dashboard() {
  const { user, profile } = useOutletContext();
  const { t } = useLang();

  return (
    <div className="p-4 space-y-5 pb-8">
      <WelcomeCard
        userName={
          user?.user_metadata?.name ||
          user?.user_metadata?.full_name ||
          user?.email
        }
      />
      <div>
        <h3 className="font-heading font-semibold text-sm text-muted-foreground mb-3 px-1">{t('quickStats')}</h3>
        <QuickStats />
      </div>
      <div>
        <h3 className="font-heading font-semibold text-sm text-muted-foreground mb-3 px-1">{t('healthServices')}</h3>
        <ServiceGrid />
      </div>
    </div>
  );
}