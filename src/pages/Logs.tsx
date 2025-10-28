import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Logs() {
  const { user } = useAuth();
  const { t } = useTranslation();

  const { data: logs, isLoading } = useQuery({
    queryKey: ['logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('logs')
        .select(`
          *,
          profiles(handle, display_name)
        `)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-bold">{t('logs.title')}</h1>
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">{t('logs.title')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{t('home.features.logs.description')}</p>
        </div>
        {user && (
          <Link to="/logs/create" className="w-full sm:w-auto">
            <Button className="w-full sm:w-auto">{t('logs.create')}</Button>
          </Link>
        )}
      </div>

      {logs && logs.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <p className="text-sm sm:text-base text-muted-foreground">{t('common.loading')}</p>
            {!user && (
              <Link to="/auth" className="inline-block">
                <Button className="w-full sm:w-auto">{t('auth.signIn')}</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {logs?.map((log) => (
            <Card key={log.id}>
              <CardHeader>
                <CardTitle className="text-lg sm:text-xl">{log.title}</CardTitle>
                <CardDescription className="text-xs sm:text-sm">
                  by {log.profiles?.display_name || 'Unknown'} • {new Date(log.created_at!).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {log.image_url && (
                  <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                    <img
                      src={log.image_url}
                      alt={log.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <p className="text-sm sm:text-base line-clamp-3">{log.body_md}</p>
                {log.tags && log.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {log.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
