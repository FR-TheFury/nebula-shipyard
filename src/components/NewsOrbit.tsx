import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from 'react-router-dom';
import type { Tables } from '@/integrations/supabase/types';

type NewsItem = Tables<'news'>;

export function NewsOrbit() {
  const { t } = useTranslation();
  const orbitRadius = 300;

  const { data: newsItems, isLoading } = useQuery({
    queryKey: ['news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return data || [];
    },
  });

  if (isLoading) {
    return (
      <div className="relative w-full h-[700px] flex items-center justify-center my-12">
        <Skeleton className="w-32 h-32 rounded-full" />
      </div>
    );
  }

  if (!newsItems || newsItems.length === 0) {
    return (
      <div className="relative w-full h-[700px] flex items-center justify-center my-12">
        <div className="text-center text-muted-foreground">
          <p>No news available</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-[700px] flex items-center justify-center my-12">
      {/* Central Sun */}
      <motion.div
        className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-neon-orange via-neon-pink to-neon-purple shadow-2xl"
        style={{
          boxShadow: '0 0 60px rgba(251, 77, 255, 0.8), 0 0 100px rgba(255, 144, 77, 0.4)'
        }}
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{
          rotate: { duration: 20, repeat: Infinity, ease: "linear" },
          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">NEWS</span>
        </div>
      </motion.div>

      {/* Orbit Ring */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full border-2 border-dashed border-primary/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />

      {/* News Items Orbiting */}
      {newsItems.map((news, index) => {
        const angle = (360 / newsItems.length) * index;
        const radian = (angle * Math.PI) / 180;
        const x = Math.cos(radian) * orbitRadius;
        const y = Math.sin(radian) * orbitRadius;

        return (
          <motion.div
            key={news.id}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
            }}
            initial={{ x, y }}
            animate={{
              x: [x, Math.cos(radian + Math.PI * 2) * orbitRadius],
              y: [y, Math.sin(radian + Math.PI * 2) * orbitRadius],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: "linear",
              delay: index * 0.5
            }}
          >
            <Link 
              to={`/news/${news.id}`}
              className="block"
            >
              <Card className="w-64 bg-card/90 backdrop-blur-md border-primary/30 hover:border-primary transition-all hover:scale-105 animate-float cursor-pointer">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant="secondary"
                      className={
                        news.category === 'Update' ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30' :
                        news.category === 'Feature' ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/30' :
                        news.category === 'Sale' ? 'bg-neon-orange/20 text-neon-orange border-neon-orange/30' :
                        news.category === 'Event' ? 'bg-neon-pink/20 text-neon-pink border-neon-pink/30' :
                        news.category === 'Tech' ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30' :
                        'bg-primary/20 text-primary border-primary/30'
                      }
                    >
                      {news.category}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(news.published_at).toLocaleDateString()}
                    </span>
                  </div>
                  <CardTitle className="text-lg line-clamp-2">{news.title}</CardTitle>
                  {news.excerpt && (
                    <p className="text-xs text-muted-foreground line-clamp-2 mt-2">
                      {news.excerpt}
                    </p>
                  )}
                </CardHeader>
              </Card>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
