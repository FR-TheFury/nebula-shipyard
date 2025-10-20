import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Rocket, Ship, ImageIcon, BookOpen, User, LogOut } from 'lucide-react';
import { LanguageSelector } from './LanguageSelector';
import { useTranslation } from 'react-i18next';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();

  const navigation = [
    { name: t('nav.home'), path: '/', icon: Rocket },
    { name: t('nav.ships'), path: '/ships', icon: Ship },
    { name: t('nav.gallery'), path: '/gallery', icon: ImageIcon },
    { name: t('nav.logs'), path: '/logs', icon: BookOpen },
    { name: t('nav.profile'), path: '/profile', icon: User },
  ];

  // Add admin link if user is admin
  if (user && isAdmin()) {
    navigation.push({ name: t('nav.admin'), path: '/admin', icon: User });
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2 font-bold text-xl">
              <Rocket className="w-6 h-6 text-primary" />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                SC Recorder
              </span>
            </Link>

            <div className="flex items-center gap-6">
              <div className="hidden md:flex gap-1">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  const isActive = location.pathname === item.path;
                  return (
                    <Link key={item.path} to={item.path}>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        size="sm"
                        className="gap-2"
                      >
                        <Icon className="w-4 h-4" />
                        {item.name}
                      </Button>
                    </Link>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <LanguageSelector />
                {user ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={signOut}
                    className="gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    {t('auth.signOut')}
                  </Button>
                ) : (
                  <Link to="/auth">
                    <Button size="sm">{t('auth.signIn')}</Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8">
        {children}
      </main>

      <footer className="border-t border-border bg-card py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          All rights reserved to Himely Production 2025
        </div>
      </footer>
    </div>
  );
}
