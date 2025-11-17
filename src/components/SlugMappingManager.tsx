import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Wrench, 
  Search,
  Trash2,
  AlertCircle,
  Database,
  Ship
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface ShipMapping {
  slug: string;
  name: string;
  manufacturer: string;
  fleetyards_slug: string | null;
  manual_override: boolean;
  has_fleetyards_data: boolean;
  has_api_data: boolean;
  mapping_reason: string | null;
}

export function SlugMappingManager() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'failed' | 'manual'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedShip, setSelectedShip] = useState<ShipMapping | null>(null);
  const [mappingDialogOpen, setMappingDialogOpen] = useState(false);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);
  const [manualSlug, setManualSlug] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [isManualOverride, setIsManualOverride] = useState(true);

  // Fetch stats
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['slug-mapping-stats'],
    queryFn: async () => {
      const { data: ships, error } = await supabase
        .from('ships')
        .select('slug, data_sources, raw_fleetyards_data, raw_starcitizen_api_data');
      
      if (error) throw error;

      const { data: manualMappings, error: mappingsError } = await supabase
        .from('ship_slug_mappings')
        .select('wiki_title', { count: 'exact', head: true });
      
      if (mappingsError) throw mappingsError;

      const { data: cacheData, error: cacheError } = await supabase
        .from('fleetyards_models_cache')
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(1);
      
      if (cacheError) throw cacheError;

      const totalShips = ships?.length || 0;
      const fleetyardsSuccess = ships?.filter(s => s.raw_fleetyards_data && Object.keys(s.raw_fleetyards_data as any).length > 0).length || 0;
      const apiSuccess = ships?.filter(s => s.raw_starcitizen_api_data && Object.keys(s.raw_starcitizen_api_data as any).length > 0).length || 0;
      const failures = totalShips - fleetyardsSuccess;

      return {
        totalShips,
        fleetyardsSuccess,
        fleetyardsPercent: totalShips > 0 ? Math.round((fleetyardsSuccess / totalShips) * 100) : 0,
        apiSuccess,
        apiPercent: totalShips > 0 ? Math.round((apiSuccess / totalShips) * 100) : 0,
        failures,
        failuresPercent: totalShips > 0 ? Math.round((failures / totalShips) * 100) : 0,
        manualMappings: manualMappings || 0,
        cacheStatus: cacheData?.[0] ? {
          lastUpdate: cacheData[0].fetched_at,
          modelsCount: (cacheData[0].models as any[])?.length || 0
        } : null
      };
    },
  });

  // Fetch ships with mapping status
  const { data: ships, isLoading: shipsLoading } = useQuery({
    queryKey: ['ships-mapping-status', filterStatus, searchTerm],
    queryFn: async () => {
      let query = supabase
        .from('ships')
        .select(`
          slug,
          name,
          manufacturer,
          raw_fleetyards_data,
          raw_starcitizen_api_data,
          data_sources
        `)
        .order('name');

      const { data: ships, error } = await query;
      if (error) throw error;

      const { data: mappings, error: mappingsError } = await supabase
        .from('ship_slug_mappings')
        .select('*');
      
      if (mappingsError) throw mappingsError;

      const mappingsMap = new Map(mappings?.map(m => [m.wiki_title, m]) || []);

      let result = ships?.map(ship => {
        const mapping = mappingsMap.get(ship.name);
        const hasFleetyardsData = ship.raw_fleetyards_data && Object.keys(ship.raw_fleetyards_data as any).length > 0;
        const hasApiData = ship.raw_starcitizen_api_data && Object.keys(ship.raw_starcitizen_api_data as any).length > 0;

        return {
          slug: ship.slug,
          name: ship.name,
          manufacturer: ship.manufacturer || 'Unknown',
          fleetyards_slug: mapping?.fleetyards_slug || null,
          manual_override: mapping?.manual_override || false,
          has_fleetyards_data: hasFleetyardsData,
          has_api_data: hasApiData,
          mapping_reason: null, // Removed reason field as it doesn't exist in schema
        };
      }) || [];

      // Apply filters
      if (filterStatus === 'success') {
        result = result.filter(s => s.has_fleetyards_data);
      } else if (filterStatus === 'failed') {
        result = result.filter(s => !s.has_fleetyards_data);
      } else if (filterStatus === 'manual') {
        result = result.filter(s => s.manual_override);
      }

      // Apply search
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        result = result.filter(s => 
          s.name.toLowerCase().includes(term) || 
          s.manufacturer.toLowerCase().includes(term) ||
          s.slug.toLowerCase().includes(term)
        );
      }

      return result;
    },
  });

  // Fetch FleetYards models
  const { data: fleetyardsModels } = useQuery({
    queryKey: ['fleetyards-models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('fleetyards_models_cache')
        .select('models')
        .order('fetched_at', { ascending: false })
        .limit(1);
      
      if (error) throw error;
      return data?.[0]?.models as any[] || [];
    },
  });

  // Save manual mapping mutation
  const saveMappingMutation = useMutation({
    mutationFn: async ({ wikiTitle, fleetyardsSlug, manualOverride }: { 
      wikiTitle: string; 
      fleetyardsSlug: string; 
      manualOverride: boolean;
    }) => {
      const { error } = await supabase
        .from('ship_slug_mappings')
        .upsert({
          wiki_title: wikiTitle,
          fleetyards_slug: fleetyardsSlug,
          manual_override: manualOverride,
        }, {
          onConflict: 'wiki_title'
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Mapping saved',
        description: 'The slug mapping has been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['ships-mapping-status'] });
      queryClient.invalidateQueries({ queryKey: ['slug-mapping-stats'] });
      setMappingDialogOpen(false);
      resetMappingForm();
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error saving mapping',
        description: error.message,
      });
    },
  });

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: async (wikiTitle: string) => {
      const { error } = await supabase
        .from('ship_slug_mappings')
        .delete()
        .eq('wiki_title', wikiTitle);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Mapping deleted',
        description: 'The manual mapping has been removed.',
      });
      queryClient.invalidateQueries({ queryKey: ['ships-mapping-status'] });
      queryClient.invalidateQueries({ queryKey: ['slug-mapping-stats'] });
    },
  });

  // Cleanup and re-sync mutation
  const cleanupMutation = useMutation({
    mutationFn: async () => {
      // Delete caches
      await supabase.from('fleetyards_cache').delete().neq('id', 0);
      await supabase.from('fleetyards_models_cache').delete().neq('id', 0);
      
      // Reset data sources
      const { data: ships } = await supabase.from('ships').select('slug, data_sources');
      
      if (ships) {
        for (const ship of ships) {
          const updatedSources = {
            ...(ship.data_sources as any),
            fleetyards: {
              has_data: false,
              last_fetch: null
            }
          };
          
          await supabase
            .from('ships')
            .update({ 
              data_sources: updatedSources,
              raw_fleetyards_data: null,
              raw_starcitizen_api_data: null
            })
            .eq('slug', ship.slug);
        }
      }

      // Invoke ships-sync
      const { error } = await supabase.functions.invoke('ships-sync');
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'Cache cleaned and sync started',
        description: 'The cache has been cleared and a full re-sync has been initiated.',
      });
      queryClient.invalidateQueries({ queryKey: ['ships-mapping-status'] });
      queryClient.invalidateQueries({ queryKey: ['slug-mapping-stats'] });
      queryClient.invalidateQueries({ queryKey: ['sync-progress'] });
      setConfirmCleanupOpen(false);
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error during cleanup',
        description: error.message,
      });
    },
  });

  // Refresh FleetYards models mutation
  const refreshModelsMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.functions.invoke('force-refresh-fleetyards-models');
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: 'FleetYards models refreshed',
        description: 'The list of FleetYards models has been updated.',
      });
      queryClient.invalidateQueries({ queryKey: ['fleetyards-models'] });
      queryClient.invalidateQueries({ queryKey: ['slug-mapping-stats'] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Error refreshing models',
        description: error.message,
      });
    },
  });

  const resetMappingForm = () => {
    setManualSlug('');
    setManualReason('');
    setIsManualOverride(true);
  };

  const openMappingDialog = (ship: ShipMapping) => {
    setSelectedShip(ship);
    setManualSlug(ship.fleetyards_slug || '');
    setManualReason('');
    setIsManualOverride(ship.manual_override);
    setMappingDialogOpen(true);
  };

  const getStatusBadge = (ship: ShipMapping) => {
    if (ship.manual_override) {
      return <Badge variant="secondary" className="gap-1"><Wrench className="w-3 h-3" /> Manual</Badge>;
    }
    if (ship.has_fleetyards_data) {
      return <Badge variant="default" className="bg-green-600 gap-1"><CheckCircle2 className="w-3 h-3" /> FleetYards</Badge>;
    }
    if (ship.has_api_data) {
      return <Badge variant="default" className="bg-blue-600 gap-1"><CheckCircle2 className="w-3 h-3" /> API</Badge>;
    }
    return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" /> Failed</Badge>;
  };

  if (statsLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Loading...</CardTitle>
          </CardHeader>
          <CardContent>
            <Loader2 className="w-8 h-8 animate-spin" />
          </CardContent>
        </Card>
      </div>
    );
  }

  const showCacheWarning = !stats?.cacheStatus || stats.cacheStatus.modelsCount === 0;

  return (
    <div className="space-y-6">
      {/* Warning for empty cache */}
      {showCacheWarning && (
        <Card className="border-orange-500 bg-orange-50 dark:bg-orange-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700 dark:text-orange-300">
              <AlertCircle className="w-5 h-5" />
              FleetYards Models Not Loaded
            </CardTitle>
            <CardDescription className="text-orange-600 dark:text-orange-400">
              The mapping system requires the FleetYards models list to function. Click the button below to load it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => refreshModelsMutation.mutate()}
              disabled={refreshModelsMutation.isPending}
              className="gap-2"
            >
              {refreshModelsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Database className="w-4 h-4" />
              )}
              Load FleetYards Models
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Total Ships</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalShips || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">FleetYards Success</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {stats?.fleetyardsSuccess || 0}
              <span className="text-sm ml-2 text-muted-foreground">
                ({stats?.fleetyardsPercent}%)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">API Success</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {stats?.apiSuccess || 0}
              <span className="text-sm ml-2 text-muted-foreground">
                ({stats?.apiPercent}%)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Mapping Failures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {stats?.failures || 0}
              <span className="text-sm ml-2 text-muted-foreground">
                ({stats?.failuresPercent}%)
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cache Status */}
      {stats?.cacheStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">FleetYards Cache Status</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div className="text-sm">
              <span className="font-medium">{stats.cacheStatus.modelsCount}</span> models cached
            </div>
            <div className="text-sm text-muted-foreground">
              Last updated: {new Date(stats.cacheStatus.lastUpdate).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Manage cache and synchronization</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-4">
          <Button
            variant="destructive"
            onClick={() => setConfirmCleanupOpen(true)}
            disabled={cleanupMutation.isPending}
            className="gap-2"
          >
            {cleanupMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Clean Cache & Re-Sync
          </Button>

          <Button
            variant="outline"
            onClick={() => refreshModelsMutation.mutate()}
            disabled={refreshModelsMutation.isPending}
            className="gap-2"
          >
            {refreshModelsMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Database className="w-4 h-4" />
            )}
            Refresh FleetYards List
          </Button>
        </CardContent>
      </Card>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Ship Mappings</CardTitle>
          <CardDescription>View and manage slug mappings for all ships</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search ships..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={filterStatus} onValueChange={(v: any) => setFilterStatus(v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Ships</SelectItem>
                <SelectItem value="success">Success Only</SelectItem>
                <SelectItem value="failed">Failures Only</SelectItem>
                <SelectItem value="manual">Manual Mappings</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Ships Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ship Name</TableHead>
                  <TableHead>Manufacturer</TableHead>
                  <TableHead>Wiki Slug</TableHead>
                  <TableHead>FleetYards Slug</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shipsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : ships && ships.length > 0 ? (
                  ships.map((ship) => (
                    <TableRow key={ship.slug}>
                      <TableCell className="font-medium">{ship.name}</TableCell>
                      <TableCell>{ship.manufacturer}</TableCell>
                      <TableCell className="font-mono text-sm">{ship.slug}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {ship.fleetyards_slug || <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>{getStatusBadge(ship)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openMappingDialog(ship)}
                          >
                            {ship.manual_override ? 'Edit' : 'Add Mapping'}
                          </Button>
                          {ship.manual_override && (
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => deleteMappingMutation.mutate(ship.name)}
                              disabled={deleteMappingMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No ships found matching your filters
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Manual Mapping Dialog */}
      <Dialog open={mappingDialogOpen} onOpenChange={setMappingDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Manual Slug Mapping</DialogTitle>
            <DialogDescription>
              Configure a manual mapping for {selectedShip?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Wiki Slug (Read-only)</Label>
              <Input value={selectedShip?.slug || ''} disabled className="font-mono" />
            </div>

            <div>
              <Label htmlFor="fleetyards-slug">FleetYards Slug</Label>
              <Select value={manualSlug} onValueChange={setManualSlug}>
                <SelectTrigger id="fleetyards-slug">
                  <SelectValue placeholder="Select a FleetYards model..." />
                </SelectTrigger>
                <SelectContent>
                  {fleetyardsModels && fleetyardsModels.length > 0 ? (
                    fleetyardsModels.map((model: any) => (
                      <SelectItem key={model.slug} value={model.slug}>
                        {model.name} ({model.slug})
                      </SelectItem>
                    ))
                  ) : (
                    <SelectItem value="none" disabled>
                      No models loaded
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="manual-override"
                checked={isManualOverride}
                onCheckedChange={(checked) => setIsManualOverride(checked as boolean)}
              />
              <Label htmlFor="manual-override" className="cursor-pointer">
                Manual Override (force this mapping)
              </Label>
            </div>

            <div>
              <Label htmlFor="reason">Reason (optional)</Label>
              <Textarea
                id="reason"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                placeholder="Why is this manual mapping needed?"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setMappingDialogOpen(false);
                resetMappingForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedShip && manualSlug) {
                  saveMappingMutation.mutate({
                    wikiTitle: selectedShip.name,
                    fleetyardsSlug: manualSlug,
                    manualOverride: isManualOverride,
                  });
                }
              }}
              disabled={!manualSlug || saveMappingMutation.isPending}
            >
              {saveMappingMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                'Save Mapping'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cleanup Confirmation Dialog */}
      <AlertDialog open={confirmCleanupOpen} onOpenChange={setConfirmCleanupOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action will:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Delete all FleetYards cache data</li>
                <li>Delete the FleetYards models cache</li>
                <li>Reset data sources for all ships</li>
                <li>Trigger a complete re-synchronization</li>
              </ul>
              <p className="mt-3 font-semibold">This process can take several minutes and cannot be undone.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cleanupMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cleanupMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Cleaning...
                </>
              ) : (
                'Confirm Cleanup'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
