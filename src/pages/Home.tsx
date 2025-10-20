import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship, ImageIcon, BookOpen, Rocket } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();
  
  const features = [
    {
      icon: Ship,
      title: t('home.features.ships.title'),
      description: t('home.features.ships.description'),
      path: '/ships',
    },
    {
      icon: ImageIcon,
      title: t('home.features.gallery.title'),
      description: t('home.features.gallery.description'),
      path: '/gallery',
    },
    {
      icon: BookOpen,
      title: t('home.features.logs.title'),
      description: t('home.features.logs.description'),
      path: '/logs',
    },
  ];

  return (
    <div className="space-y-12">
      <section className="text-center space-y-6 py-12">
        <div className="flex justify-center">
          <div className="p-4 bg-gradient-to-br from-primary to-secondary rounded-full">
            <Rocket className="w-16 h-16 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-5xl font-bold bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
          {t('home.hero')}
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          {t('home.description')}
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/ships">
            <Button size="lg">{t('nav.ships')}</Button>
          </Link>
          <Link to="/gallery">
            <Button size="lg" variant="outline">{t('nav.gallery')}</Button>
          </Link>
        </div>
      </section>

      <section className="grid md:grid-cols-3 gap-6">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <Link key={feature.path} to={feature.path}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="p-3 bg-primary/10 rounded-lg w-fit mb-4">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
