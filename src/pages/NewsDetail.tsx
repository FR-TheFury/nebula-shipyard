import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { motion } from 'framer-motion';
import { SpaceBackground } from '@/components/SpaceBackground';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, ArrowLeft } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function NewsDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: newsItem, isLoading } = useQuery({
    queryKey: ['news', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('news')
        .select('*')
        .eq('id', Number(id))
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <>
        <SpaceBackground />
        <div className="min-h-screen pt-24 px-4">
          <div className="container mx-auto max-w-4xl">
            <Skeleton className="h-8 w-24 mb-8" />
            <Skeleton className="h-12 w-3/4 mb-4" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </>
    );
  }

  if (!newsItem) {
    return (
      <>
        <SpaceBackground />
        <div className="min-h-screen pt-24 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h1 className="text-2xl font-bold mb-4">News not found</h1>
            <Button onClick={() => navigate('/')}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Home
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SpaceBackground />
      <div className="min-h-screen pt-24 px-4 pb-12">
        <div className="container mx-auto max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Button
              variant="ghost"
              onClick={() => navigate('/')}
              className="mb-6"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>

            <Card className="bg-card/90 backdrop-blur-md border-primary/30">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Badge
                    variant="secondary"
                    className={
                      newsItem.category === 'Update' ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30' :
                      newsItem.category === 'Feature' ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/30' :
                      newsItem.category === 'Sale' ? 'bg-neon-orange/20 text-neon-orange border-neon-orange/30' :
                      newsItem.category === 'Event' ? 'bg-neon-pink/20 text-neon-pink border-neon-pink/30' :
                      newsItem.category === 'Tech' ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30' :
                      'bg-primary/20 text-primary border-primary/30'
                    }
                  >
                    {newsItem.category}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {new Date(newsItem.published_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </span>
                </div>
                <CardTitle className="text-3xl">{newsItem.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {newsItem.image_url && (
                  <img
                    src={newsItem.image_url}
                    alt={newsItem.title}
                    className="w-full rounded-lg"
                  />
                )}
                
                {newsItem.excerpt && (
                  <p className="text-lg text-muted-foreground leading-relaxed">
                    {newsItem.excerpt}
                  </p>
                )}

                {newsItem.content_md && newsItem.content_md !== newsItem.excerpt && (
                  <div className="prose prose-invert max-w-none">
                    <ReactMarkdown>{newsItem.content_md}</ReactMarkdown>
                  </div>
                )}

                <div className="pt-6 border-t border-border">
                  <Button
                    size="lg"
                    className="w-full sm:w-auto"
                    asChild
                  >
                    <a
                      href={newsItem.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Read Full Article on RSI
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </div>
    </>
  );
}
