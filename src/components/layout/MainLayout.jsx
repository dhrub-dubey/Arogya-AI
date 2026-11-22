import React, { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AppHeader from './AppHeader';
import AppSidebar from './AppSidebar';
import BottomNav from './BottomNav';
import { useAuth } from '@/lib/AuthContext';

export default function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { pathname } = useLocation();
  // The chat screen has its own message bar at the bottom, so it hides the tab bar.
  const showBottomNav = pathname !== '/chat';

  // Start each page at the top, and close the menu after navigating.
  useEffect(() => {
    window.scrollTo(0, 0);
    setSidebarOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-[100dvh] bg-background">
      <AppHeader onMenuToggle={() => setSidebarOpen(true)} user={user} />
      <AppSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <main className={`max-w-5xl mx-auto ${showBottomNav ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0' : ''}`}>
        <Outlet context={{ user }} />
      </main>
      {showBottomNav && <BottomNav onMore={() => setSidebarOpen(true)} />}
    </div>
  );
}
