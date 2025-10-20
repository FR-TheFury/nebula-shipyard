import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { ShipViewer3D } from '@/components/ShipViewer3D';

export default function ShipDetail() {
  const { slug } = useParams();
  const { t } = useTranslation();
  
  const { data: ship, isLoading } = useQuery({
    queryKey: ['ship', slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('*')
        .eq('slug', slug)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!ship) {
    return (
      <div className="space-y-6">
        <Link to="/ships">
          <Button variant="ghost" className="gap-2">
            <ArrowLeft className="h-4 w-4" />
            {t('common.back')}
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('ships.notFound')}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/ships">
        <Button variant="ghost" className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          {t('common.back')}
        </Button>
      </Link>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold text-neon-pink">{ship.name}</h1>
            {ship.manufacturer && (
              <p className="text-xl text-muted-foreground mt-2">{ship.manufacturer}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {ship.role && (
              <Badge variant="secondary" className="bg-neon-purple/20 text-neon-purple border-neon-purple/30">
                {ship.role}
              </Badge>
            )}
            {ship.size && (
              <Badge variant="outline" className="border-neon-blue/30 text-neon-blue">
                {ship.size}
              </Badge>
            )}
          </div>
        </div>

        {ship.model_glb_url ? (
          <Card className="overflow-hidden bg-card/50 backdrop-blur-sm border-primary/20">
            <CardContent className="p-0">
              <ShipViewer3D modelUrl={ship.model_glb_url} shipName={ship.name} />
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden bg-card/50 backdrop-blur-sm border-primary/20">
            <CardContent className="p-0">
              <div className="aspect-video bg-muted relative">
                <img
                  src={ship.image_url || '/placeholder.svg'}
                  alt={`${ship.name}${ship.manufacturer ? ` by ${ship.manufacturer}` : ''} - Star Citizen ship image`}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.currentTarget as HTMLImageElement;
                    if (target.src.endsWith('/placeholder.svg')) return;
                    target.src = '/placeholder.svg';
                  }}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-neon-blue">{t('ships.specifications')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(ship.crew_min || ship.crew_max) && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.crew')}:</span>
                <span className="text-primary font-medium">
                  {ship.crew_min}{ship.crew_max ? `-${ship.crew_max}` : ''}
                </span>
              </div>
            )}
            {ship.cargo_scu && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.cargo')}:</span>
                <span className="text-primary font-medium">{ship.cargo_scu} SCU</span>
              </div>
            )}
            {ship.scm_speed && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.scm')}:</span>
                <span className="text-primary font-medium">{ship.scm_speed} m/s</span>
              </div>
            )}
            {ship.max_speed && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.max')}:</span>
                <span className="text-primary font-medium">{ship.max_speed} m/s</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-neon-blue">{t('ships.dimensions')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {ship.length_m && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.length')}:</span>
                <span className="text-primary font-medium">{ship.length_m} m</span>
              </div>
            )}
            {ship.beam_m && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.beam')}:</span>
                <span className="text-primary font-medium">{ship.beam_m} m</span>
              </div>
            )}
            {ship.height_m && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('ships.height')}:</span>
                <span className="text-primary font-medium">{ship.height_m} m</span>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {Array.isArray((ship as any).prices) && (ship as any).prices.length > 0 && (
        <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
          <CardHeader>
            <CardTitle className="text-neon-blue">Pricing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(ship as any).prices.map((p: any, idx: number) => (
              <div key={idx} className="flex justify-between text-sm">
                <span className="text-muted-foreground">{p?.type || 'Pledge'}</span>
                <span className="text-primary font-medium">
                  {(p?.currency === 'USD' ? '$' : (p?.currency || ''))}{p?.amount}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="bg-card/50 backdrop-blur-sm border-primary/20">
        <CardHeader>
          <CardTitle className="text-neon-blue">{t('ships.externalLinks')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <a
            href={`https://starcitizen.tools/${ship.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {t('ships.viewOnWiki')}
            </Button>
          </a>
          <a
            href={`https://www.erkul.games/live/calculator?ship=${ship.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" className="gap-2">
              <ExternalLink className="h-4 w-4" />
              {t('ships.erkulLoadout')}
            </Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
