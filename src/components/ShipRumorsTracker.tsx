import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, Loader2, Rocket, Eye, ExternalLink, Search, Clock, AlertTriangle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

// Development stage progress mapping (NO flight_ready - those are announced ships!)
const STAGE_PROGRESS: Record<string, number> = {
  'concepting': 10,
  'early_concept': 15,
  'whitebox': 35,
  'greybox': 60,
  'final_review': 85
};

const STAGE_LABELS: Record<string, string> = {
  'concepting': 'Concepting',
  'early_concept': 'Early Concept',
  'whitebox': 'Whitebox',
  'greybox': 'Greybox',
  'final_review': 'Final Review'
};

const STAGE_COLORS: Record<string, string> = {
  'concepting': 'bg-slate-500',
  'early_concept': 'bg-blue-500',
  'whitebox': 'bg-yellow-500',
  'greybox': 'bg-orange-500',
  'final_review': 'bg-purple-500'
};

const SOURCE_LABELS: Record<string, string> = {
  'monthly_report': 'Monthly Report',
  'datamine': 'Datamine',
  'leak': 'Leak',
  'roadmap': 'Roadmap'
};

interface EvidenceItem {
  source: string;
  date: string;
  excerpt: string;
}

interface ShipRumor {
  id: string;
  codename: string;
  possible_name: string | null;
  possible_manufacturer: string | null;
  development_stage: string | null;
  ship_type: string | null;
  estimated_size: string | null;
  source_type: string;
  source_url: string | null;
  source_date: string | null;
  first_mentioned: string;
  last_updated: string;
  evidence: EvidenceItem[] | null;
  confirmed_ship_id: number | null;
  is_active: boolean;
  notes: string | null;
}

export function ShipRumorsTracker() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<string | null>(null);

  // Fetch rumors
  const { data: rumors, isLoading } = useQuery({
    queryKey: ['ship-rumors', filter],
    queryFn: async () => {
      let query = supabase
        .from('ship_rumors')
        .select('*')
        .eq('is_active', true)
        .order('last_updated', { ascending: false });

      if (filter) {
        query = query.eq('development_stage', filter);
      }

      const { data, error } = await query;
      if (error) throw error;
      // Cast and parse evidence field
      return (data || []).map(row => ({
        ...row,
        evidence: Array.isArray(row.evidence) ? (row.evidence as unknown as EvidenceItem[]) : null
      })) as ShipRumor[];
    }
  });

  // Sync rumors
  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('unannounced-ships-sync');
      
      if (error) throw error;

      toast({
        title: 'Sync réussie',
        description: `${data.stats?.inserted || 0} nouveaux, ${data.stats?.updated || 0} mis à jour`,
      });

      queryClient.invalidateQueries({ queryKey: ['ship-rumors'] });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      toast({
        variant: 'destructive',
        title: 'Erreur de synchronisation',
        description: message,
      });
    } finally {
      setSyncing(false);
    }
  };

  // Get stage counts
  const stageCounts = rumors?.reduce((acc, rumor) => {
    const stage = rumor.development_stage || 'unknown';
    acc[stage] = (acc[stage] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-card/50 backdrop-blur-sm border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-primary" />
            Vaisseaux Non-Annoncés / En Développement
          </CardTitle>
          <CardDescription>
            Suivi automatique des vaisseaux mentionnés dans les Monthly Reports et sources de datamining
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Button
              onClick={handleSync}
              disabled={syncing}
              className="bg-gradient-to-r from-primary to-primary/80"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Synchronisation...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Sync Rumors
                </>
              )}
            </Button>
            
            <div className="text-sm text-muted-foreground">
              {rumors?.length || 0} vaisseaux en développement trackés
            </div>
          </div>

          {/* Stage filters */}
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={filter === null ? 'default' : 'outline'}
              className="cursor-pointer"
              onClick={() => setFilter(null)}
            >
              Tous ({rumors?.length || 0})
            </Badge>
            {Object.entries(STAGE_LABELS).map(([stage, label]) => (
              <Badge
                key={stage}
                variant={filter === stage ? 'default' : 'outline'}
                className={`cursor-pointer ${filter === stage ? STAGE_COLORS[stage] : ''}`}
                onClick={() => setFilter(stage)}
              >
                {label} ({stageCounts[stage] || 0})
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rumors list */}
      {rumors?.length === 0 ? (
        <Card className="bg-card/50 backdrop-blur-sm">
          <CardContent className="py-12 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Aucun vaisseau non-annoncé trouvé. Lancez une synchronisation.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {rumors?.map((rumor) => (
            <RumorCard key={rumor.id} rumor={rumor} />
          ))}
        </div>
      )}
    </div>
  );
}

function RumorCard({ rumor }: { rumor: ShipRumor }) {
  const stage = rumor.development_stage || 'concepting';
  const progress = STAGE_PROGRESS[stage] || 10;
  const stageLabel = STAGE_LABELS[stage] || stage;
  const stageColor = STAGE_COLORS[stage] || 'bg-muted';

  const evidenceArray = rumor.evidence || [];

  return (
    <Card className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/50 transition-colors">
      <CardContent className="py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            {/* Header */}
            <div className="flex items-center gap-3">
              <Rocket className="w-5 h-5 text-primary" />
              <h3 className="font-semibold text-lg">
                {rumor.possible_name || rumor.codename}
              </h3>
              {rumor.confirmed_ship_id && (
                <Badge variant="default" className="bg-accent">
                  ✓ Confirmé
                </Badge>
              )}
            </div>

            {/* Manufacturer & Type */}
            {(rumor.possible_manufacturer || rumor.ship_type) && (
              <div className="flex gap-2 text-sm text-muted-foreground">
                {rumor.possible_manufacturer && (
                  <span>Fabricant: {rumor.possible_manufacturer}</span>
                )}
                {rumor.ship_type && (
                  <span>• Type: {rumor.ship_type}</span>
                )}
                {rumor.estimated_size && (
                  <span>• Taille: {rumor.estimated_size}</span>
                )}
              </div>
            )}

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <Badge className={stageColor}>{stageLabel}</Badge>
                <span className="text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Source info */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Eye className="w-4 h-4" />
                Source: {SOURCE_LABELS[rumor.source_type] || rumor.source_type}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Mis à jour {formatDistanceToNow(new Date(rumor.last_updated), { addSuffix: true, locale: fr })}
              </span>
            </div>

            {/* Evidence excerpt */}
            {evidenceArray.length > 0 && evidenceArray[0]?.excerpt && (
              <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground italic">
                "{evidenceArray[0].excerpt.substring(0, 200)}..."
              </blockquote>
            )}

            {/* Notes */}
            {rumor.notes && (
              <p className="text-sm text-muted-foreground">{rumor.notes}</p>
            )}
          </div>

          {/* External link */}
          {rumor.source_url && (
            <a
              href={rumor.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="w-5 h-5" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
