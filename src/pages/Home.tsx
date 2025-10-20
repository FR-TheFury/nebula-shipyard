import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship, ImageIcon, BookOpen, Rocket } from 'lucide-react';

export default function Home() {
  const features = [
    {
      icon: Ship,
      title: 'Ship Database',
      description: 'Browse detailed information about Star Citizen ships',
      path: '/ships',
    },
    {
      icon: ImageIcon,
      title: 'Community Gallery',
      description: 'Share and explore amazing screenshots from the verse',
      path: '/gallery',
    },
    {
      icon: BookOpen,
      title: 'Pilot Logs',
      description: 'Document your adventures and experiences',
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
          Welcome to Neon Space
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Your hub for Star Citizen content, ships, and community
        </p>
        <div className="flex gap-4 justify-center">
          <Link to="/ships">
            <Button size="lg">Explore Ships</Button>
          </Link>
          <Link to="/gallery">
            <Button size="lg" variant="outline">View Gallery</Button>
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
