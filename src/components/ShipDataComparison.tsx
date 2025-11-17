import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function ShipDataComparison() {
  const [selectedShip, setSelectedShip] = useState<string>('');
  const [reason, setReason] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all ships
  const { data: ships, isLoading: shipsLoading } = useQuery({
    queryKey: ['ships-list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('slug, name, manufacturer')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch selected ship data
  const { data: shipData, isLoading: shipLoading } = useQuery({
    queryKey: ['ship-comparison', selectedShip],
    enabled: !!selectedShip,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('*')
        .eq('slug', selectedShip)
        .single();
      if (error) throw error;
      return data;
    }
  });

  // Fetch preference
  const { data: preference } = useQuery({
    queryKey: ['ship-preference', selectedShip],
    enabled: !!selectedShip,
    queryFn: async () => {
      const { data } = await supabase
        .from('ship_data_preferences')
        .select('*')
        .eq('ship_slug', selectedShip)
        .maybeSingle();
      return data;
    }
  });

  // Override mutation
  const overrideMutation = useMutation({
    mutationFn: async ({ source, clearCache }: { source: string; clearCache?: boolean }) => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('ship-data-override', {
        body: {
          ship_slug: selectedShip,
          preferred_source: source,
          reason: reason || null,
          clear_cache: clearCache
        }
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ship-comparison', selectedShip] });
      queryClient.invalidateQueries({ queryKey: ['ship-preference', selectedShip] });
      toast({ title: 'Data source updated successfully' });
      setReason('');
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error updating data source', 
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Stats query
  const { data: stats } = useQuery({
    queryKey: ['ship-data-stats'],
    queryFn: async () => {
      const { data: allShips } = await supabase
        .from('ships')
        .select('data_sources, armament, systems');
      
      const total = allShips?.length || 0;
      const wikiCount = allShips?.filter(s => {
        const sources = s.data_sources as any;
        return sources?.wiki?.has_data;
      }).length || 0;
      const fleetyardsCount = allShips?.filter(s => {
        const sources = s.data_sources as any;
        return sources?.fleetyards?.has_data;
      }).length || 0;
      const noArmament = allShips?.filter(s => {
        const arm = s.armament as any;
        return !arm || !Object.values(arm).some((arr: any) => arr?.length > 0);
      }).length || 0;

      const { count: cacheCount } = await supabase
        .from('fleetyards_cache')
        .select('*', { count: 'exact', head: true });

      const { count: expiredCount } = await supabase
        .from('fleetyards_cache')
        .select('*', { count: 'exact', head: true })
        .lt('expires_at', new Date().toISOString());

      return {
        total,
        wikiCount,
        fleetyardsCount,
        noArmament,
        cacheCount: cacheCount || 0,
        expiredCount: expiredCount || 0
      };
    }
  });

  const renderDataColumn = (title: string, data: any, isCurrent?: boolean) => {
    if (!data) {
      return (
        <Card className="h-full">
          <CardHeader>
            <CardTitle className="text-sm">{title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">No data available</p>
          </CardContent>
        </Card>
      );
    }

    const armament = data.armament || {};
    const systems = data.systems || {};

    return (
      <Card className={`h-full ${isCurrent ? 'border-primary' : ''}`}>
        <CardHeader>
          <CardTitle className="text-sm flex items-center justify-between">
            {title}
            {isCurrent && <Badge variant="default">Current</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h4 className="font-semibold mb-2">Armament</h4>
            <div className="space-y-1 pl-2">
              {Object.entries(armament).map(([key, value]) => (
                <div key={key}>
                  <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}:</span>{' '}
                  <span>{(value as any[])?.length || 0} items</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h4 className="font-semibold mb-2">Systems</h4>
            <div className="space-y-1 pl-2">
              {Object.entries(systems).map(([key, group]) => {
                const count = Object.values(group || {}).reduce((acc: number, arr: any) => acc + (arr?.length || 0), 0);
                return (
                  <div key={key}>
                    <span className="text-muted-foreground capitalize">{key}:</span>{' '}
                    <span>{count} items</span>
                  </div>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.total || 0}</div>
            <p className="text-xs text-muted-foreground">Total Ships</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.wikiCount || 0}</div>
            <p className="text-xs text-muted-foreground">Wiki Data ({((stats?.wikiCount || 0) / (stats?.total || 1) * 100).toFixed(0)}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.fleetyardsCount || 0}</div>
            <p className="text-xs text-muted-foreground">FleetYards Data ({((stats?.fleetyardsCount || 0) / (stats?.total || 1) * 100).toFixed(0)}%)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.noArmament || 0}</div>
            <p className="text-xs text-muted-foreground">No Armament</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.cacheCount || 0}</div>
            <p className="text-xs text-muted-foreground">Cache Entries ({stats?.expiredCount || 0} expired)</p>
          </CardContent>
        </Card>
      </div>

      {/* Ship Selector */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Ship Data Sources</CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={selectedShip} onValueChange={setSelectedShip}>
            <SelectTrigger>
              <SelectValue placeholder="Select a ship" />
            </SelectTrigger>
            <SelectContent>
              {shipsLoading ? (
                <div className="p-2 text-center">
                  <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                </div>
              ) : (
                ships?.map((ship) => (
                  <SelectItem key={ship.slug} value={ship.slug}>
                    {ship.manufacturer} {ship.name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* Comparison View */}
      {selectedShip && (
        <>
          {preference && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" />
                  <span className="text-sm">
                    Manual preference: <Badge>{preference.preferred_source}</Badge>
                    {preference.reason && ` - ${preference.reason}`}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {renderDataColumn('Wiki Data', shipData?.raw_wiki_data)}
            {renderDataColumn('FleetYards Data', shipData?.raw_fleetyards_data)}
            {renderDataColumn('Current (Merged)', {
              armament: shipData?.armament,
              systems: shipData?.systems
            }, true)}
          </div>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Override Data Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="Reason for override (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => overrideMutation.mutate({ source: 'wiki' })}
                  disabled={overrideMutation.isPending || !shipData?.raw_wiki_data}
                >
                  {overrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Use Wiki Data
                </Button>
                <Button
                  onClick={() => overrideMutation.mutate({ source: 'fleetyards' })}
                  disabled={overrideMutation.isPending || !shipData?.raw_fleetyards_data}
                >
                  {overrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Use FleetYards Data
                </Button>
                <Button
                  onClick={() => overrideMutation.mutate({ source: 'auto' })}
                  disabled={overrideMutation.isPending}
                  variant="outline"
                >
                  {overrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Auto-merge
                </Button>
                <Button
                  onClick={() => overrideMutation.mutate({ source: 'auto', clearCache: true })}
                  disabled={overrideMutation.isPending}
                  variant="destructive"
                >
                  {overrideMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                  Clear Cache & Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {shipLoading && (
        <div className="flex justify-center p-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      )}
    </div>
  );
}
