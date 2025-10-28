import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Ship, ImageIcon, BookOpen, Rocket, ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { SpaceBackground } from '@/components/SpaceBackground';
import GalacticMap from '@/components/GalacticMap';
import { ShipCard } from '@/components/ShipCard';
import { GalleryCard } from '@/components/GalleryCard';
import { Skeleton } from '@/components/ui/skeleton';
import { motion } from 'framer-motion';

export default function Home() {
  const { t } = useTranslation();
  
  // Fetch latest ships
  const { data: latestShips, isLoading: shipsLoading } = useQuery({
    queryKey: ['latest-ships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch latest gallery posts
  const { data: latestGallery, isLoading: galleryLoading } = useQuery({
    queryKey: ['latest-gallery'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('gallery_posts')
        .select(`
          *,
          gallery_images(image_url),
          profiles(handle, display_name)
        `)
        .order('created_at', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return data;
    },
  });
  
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
    <>
      <SpaceBackground />
      
      <div className="space-y-12 md:space-y-20 relative">
        {/* Hero Section */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center space-y-4 md:space-y-6 py-6 md:py-12"
        >
          <motion.div
            className="flex justify-center"
            animate={{
              y: [0, -10, 0],
              rotate: [0, 5, -5, 0],
            }}
            transition={{
              duration: 6,
              repeat: Infinity,
              ease: "easeInOut"
            }}
          >
            <div className="p-3 md:p-4 bg-gradient-to-br from-neon-pink via-neon-purple to-neon-blue rounded-full shadow-lg shadow-primary/50">
              <Rocket className="w-12 h-12 md:w-16 md:h-16 text-white" />
            </div>
          </motion.div>
          
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-neon-pink via-neon-blue to-neon-purple bg-clip-text text-transparent animate-glow px-4">
            {t('home.hero')}
          </h1>
          
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto px-4">
            {t('home.description')}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center px-4">
            <Link to="/ships" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-neon-pink to-neon-purple hover:shadow-lg hover:shadow-primary/50 transition-all">
                {t('nav.ships')}
              </Button>
            </Link>
            <Link to="/gallery" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto border-neon-blue text-neon-blue hover:bg-neon-blue/10">
                {t('nav.gallery')}
              </Button>
            </Link>
          </div>
        </motion.section>

        {/* Galactic News Map */}
        <section className="py-6 md:py-12">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1 }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center mb-6 md:mb-8 bg-gradient-to-r from-neon-orange via-neon-pink to-neon-purple bg-clip-text text-transparent px-4">
              Galactic News Map
            </h2>
            <GalacticMap />
          </motion.div>
        </section>

        {/* Latest Ships Section */}
        <motion.section
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="space-y-4 md:space-y-6"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-neon-pink to-neon-purple bg-clip-text text-transparent">
              Latest Ships
            </h2>
            <Link to="/ships">
              <Button variant="ghost" className="gap-2 text-neon-blue hover:text-neon-pink transition-colors text-sm sm:text-base">
                View All <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          
          {shipsLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video w-full" />
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {latestShips?.map((ship) => (
                <motion.div
                  key={ship.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  <ShipCard ship={ship} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Latest Gallery Section */}
        <motion.section
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="space-y-4 md:space-y-6"
        >
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold bg-gradient-to-r from-neon-blue to-neon-purple bg-clip-text text-transparent">
              Latest Gallery
            </h2>
            <Link to="/gallery">
              <Button variant="ghost" className="gap-2 text-neon-blue hover:text-neon-pink transition-colors text-sm sm:text-base">
                View All <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
          
          {galleryLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {[...Array(3)].map((_, i) => (
                <Card key={i} className="overflow-hidden">
                  <Skeleton className="aspect-video w-full" />
                  <CardHeader>
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {latestGallery?.map((post) => (
                <motion.div
                  key={post.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5 }}
                >
                  <GalleryCard post={post} />
                </motion.div>
              ))}
            </div>
          )}
        </motion.section>

        {/* Features Section */}
        <motion.section
          initial={{ opacity: 0, y: 50 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6"
        >
          {features.map((feature, index) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.path}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Link to={feature.path}>
                  <Card className="h-full hover:shadow-lg hover:shadow-primary/20 transition-all cursor-pointer bg-card/50 backdrop-blur-sm border-primary/20 hover:border-primary/50 hover:-translate-y-1">
                    <CardHeader>
                      <div className="p-3 bg-gradient-to-br from-primary/20 to-secondary/20 rounded-lg w-fit mb-4">
                        <Icon className="w-6 h-6 text-primary" />
                      </div>
                      <CardTitle className="text-neon-pink">{feature.title}</CardTitle>
                      <CardDescription>{feature.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </motion.section>
      </div>
    </>
  );
}
