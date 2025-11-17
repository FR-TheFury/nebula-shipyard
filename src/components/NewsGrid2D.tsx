import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Eye } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface News {
  id: number;
  title: string;
  excerpt: string | null;
  category: string;
  published_at: string;
  image_url: string | null;
  view_count: number | null;
  tags?: string[];
}

interface NewsGrid2DProps {
  news: News[];
  isLoading?: boolean;
}

export default function NewsGrid2D({ news, isLoading }: NewsGrid2DProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <div className="aspect-video bg-muted rounded-t-lg" />
            <CardHeader>
              <div className="h-4 bg-muted rounded w-3/4" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded" />
                <div className="h-3 bg-muted rounded w-5/6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (news.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">Aucune news trouvée</p>
        <p className="text-sm text-muted-foreground mt-2">
          Essayez de modifier vos filtres
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {news.map((item, index) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: index * 0.05, duration: 0.3 }}
        >
          <Card
            className="bg-card/95 backdrop-blur border-primary/30 hover:border-primary/60 transition-all cursor-pointer group hover:shadow-lg hover:shadow-primary/20 h-full flex flex-col"
            onClick={() => navigate(`/news/${item.id}`)}
          >
            {item.image_url && (
              <div className="aspect-video w-full overflow-hidden rounded-t-lg relative">
                <img
                  src={item.image_url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-3 right-3">
                  <Badge
                    variant="secondary"
                    className={
                      item.category === 'Update'
                        ? 'bg-neon-blue/90 text-white border-neon-blue/30'
                        : item.category === 'Feature'
                          ? 'bg-neon-purple/90 text-white border-neon-purple/30'
                          : item.category === 'Sale'
                            ? 'bg-neon-orange/90 text-white border-neon-orange/30'
                            : item.category === 'Event'
                              ? 'bg-neon-pink/90 text-white border-neon-pink/30'
                              : item.category === 'Tech'
                                ? 'bg-neon-blue/90 text-white border-neon-blue/30'
                                : 'bg-primary/90 text-white border-primary/30'
                    }
                  >
                    {item.category}
                  </Badge>
                </div>
              </div>
            )}

            <CardHeader className="pb-3 flex-1">
              <div className="space-y-2">
                {!item.image_url && (
                  <Badge
                    variant="secondary"
                    className={
                      item.category === 'Update'
                        ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30'
                        : item.category === 'Feature'
                          ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/30'
                          : item.category === 'Sale'
                            ? 'bg-neon-orange/20 text-neon-orange border-neon-orange/30'
                            : item.category === 'Event'
                              ? 'bg-neon-pink/20 text-neon-pink border-neon-pink/30'
                              : item.category === 'Tech'
                                ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30'
                                : 'bg-primary/20 text-primary border-primary/30'
                    }
                  >
                    {item.category}
                  </Badge>
                )}
                <CardTitle className="text-lg leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                  {item.title}
                </CardTitle>
              </div>
            </CardHeader>

            <CardContent className="space-y-3 pt-0">
              {item.excerpt && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {item.excerpt}
                </p>
              )}

              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border/50">
                <div className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  <span>{item.view_count || 0} vues</span>
                </div>
                <span>{format(new Date(item.published_at), 'd MMM yyyy', { locale: fr })}</span>
              </div>

              {item.tags && item.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.tags.slice(0, 3).map((tag) => (
                    <Badge
                      key={tag}
                      variant="outline"
                      className="text-xs px-2 py-0"
                    >
                      {tag}
                    </Badge>
                  ))}
                  {item.tags.length > 3 && (
                    <Badge variant="outline" className="text-xs px-2 py-0">
                      +{item.tags.length - 3}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
