import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Rocket, Ship, ImageIcon, BookOpen, User, LogOut, Menu, X } from 'lucide-react';
import { LanguageSelector } from './LanguageSelector';
import { useTranslation } from 'react-i18next';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

export default function Layout({ children }: { children: ReactNode }) {
  const { user, signOut, isAdmin } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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
      <nav className="border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex h-16 items-center justify-between">
            <Link to="/" className="flex items-center gap-2 font-bold text-lg md:text-xl">
              <Rocket className="w-5 h-5 md:w-6 md:h-6 text-primary" />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                SC Recorder
              </span>
            </Link>

            <div className="flex items-center gap-2 md:gap-6">
              {/* Desktop Navigation */}
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

              <div className="hidden md:flex items-center gap-2">
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

              {/* Mobile Navigation */}
              <div className="flex md:hidden items-center gap-2">
                <LanguageSelector />
                <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                  <SheetTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Menu className="w-5 h-5" />
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="right" className="w-[280px] sm:w-[350px] bg-card">
                    <SheetHeader>
                      <SheetTitle className="flex items-center gap-2">
                        <Rocket className="w-5 h-5 text-primary" />
                        <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                          SC Recorder
                        </span>
                      </SheetTitle>
                    </SheetHeader>
                    <div className="flex flex-col gap-4 mt-8">
                      {navigation.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.path;
                        return (
                          <Link 
                            key={item.path} 
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Button
                              variant={isActive ? "default" : "ghost"}
                              className="w-full justify-start gap-3"
                              size="lg"
                            >
                              <Icon className="w-5 h-5" />
                              {item.name}
                            </Button>
                          </Link>
                        );
                      })}
                      
                      <div className="border-t border-border pt-4 mt-4">
                        {user ? (
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-3"
                            size="lg"
                            onClick={() => {
                              signOut();
                              setMobileMenuOpen(false);
                            }}
                          >
                            <LogOut className="w-5 h-5" />
                            {t('auth.signOut')}
                          </Button>
                        ) : (
                          <Link to="/auth" onClick={() => setMobileMenuOpen(false)}>
                            <Button className="w-full" size="lg">
                              {t('auth.signIn')}
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </SheetContent>
                </Sheet>
              </div>
            </div>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-6 md:py-8">
        {children}
      </main>

      <footer className="border-t border-border bg-card py-6 mt-auto">
        <div className="container mx-auto px-4 text-center text-xs md:text-sm text-muted-foreground">
          All rights reserved to Himely Production 2025
        </div>
      </footer>
    </div>
  );
}
