import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ProfileEditDialog } from '@/components/ProfileEditDialog';

export default function Profile() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  const { data: profile, isLoading } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  if (authLoading || isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center gap-4">
            <Skeleton className="w-20 h-20 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-32" />
            </div>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!user || !profile) return null;

  const stats = profile.stats as any;

  return (
    <div className="space-y-4 md:space-y-6">
      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Avatar className="w-16 h-16 sm:w-20 sm:h-20">
            <AvatarImage src={profile.avatar_url || undefined} />
            <AvatarFallback className="text-xl sm:text-2xl">
              {profile.display_name?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-xl sm:text-2xl">{profile.display_name}</CardTitle>
            <CardDescription className="text-sm sm:text-base">@{profile.handle}</CardDescription>
          </div>
        </CardHeader>
        {profile.bio_md && (
          <CardContent>
            <p className="text-sm sm:text-base text-muted-foreground">{profile.bio_md}</p>
          </CardContent>
        )}
      </Card>

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">{t('profile.stats')}</CardTitle>
            <CardDescription className="text-sm">Skills & Achievements</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats).map(([key, value]) => {
                const numValue = typeof value === 'number' ? value : 0;
                const maxValue = key === 'flight_hours' || key === 'events_completed' ? 100 : 10;
                const displayValue = key === 'kd_ratio' ? numValue.toFixed(2) : numValue;
                const percentage = key === 'flight_hours' || key === 'events_completed' 
                  ? Math.min((numValue / 500) * 100, 100) 
                  : (numValue / maxValue) * 100;
                
                const getBarColor = (value: number, max: number) => {
                  const ratio = value / max;
                  if (ratio >= 0.8) return 'bg-primary';
                  if (ratio >= 0.6) return 'bg-accent';
                  if (ratio >= 0.4) return 'bg-secondary';
                  if (ratio >= 0.2) return 'bg-yellow-500';
                  return 'bg-muted-foreground/30';
                };

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex justify-between items-center">
                      <p className="text-xs sm:text-sm font-medium capitalize">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs sm:text-sm font-bold text-primary">
                        {displayValue}{key !== 'kd_ratio' && key !== 'flight_hours' && key !== 'events_completed' && '/10'}
                      </p>
                    </div>
                    <div className="h-2 sm:h-3 bg-muted rounded-full overflow-hidden">
                      <div 
                        className={`h-full ${getBarColor(numValue, maxValue)} transition-all duration-500 rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg sm:text-xl">Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileEditDialog profile={profile} />
        </CardContent>
      </Card>
    </div>
  );
}
