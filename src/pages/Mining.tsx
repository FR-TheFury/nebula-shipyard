import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ArrowUpDown, Gem, Factory, Mountain, Droplets, FlaskConical, Timer, Coins } from 'lucide-react';

export default function Mining() {
  const [search, setSearch] = useState('');
  const [rarityFilter, setRarityFilter] = useState<string>('all');
  const [systemFilter, setSystemFilter] = useState<string>('all');
  const [activeTab, setActiveTab] = useState<'resources' | 'methods' | 'yields'>('resources');

  const { data: miningResources, isLoading: loadingResources } = useQuery({
    queryKey: ['mining-resources'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('mining_resources')
        .select('*, commodities(name, slug, category, is_illegal)')
        .order('star_system');
      if (error) throw error;
      return data;
    },
  });

  const { data: refineryMethods } = useQuery({
    queryKey: ['refinery-methods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('refinery_methods')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: refineryYields, isLoading: loadingYields } = useQuery({
    queryKey: ['refinery-yields'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('refinery_yields')
        .select('*, commodities(name), refinery_methods(name), terminals(name, star_system)')
        .order('yield_pct', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const systems = useMemo(() => {
    if (!miningResources) return [];
    return Array.from(new Set(miningResources.map(r => r.star_system).filter(Boolean))).sort();
  }, [miningResources]);

  const filteredResources = useMemo(() => {
    if (!miningResources) return [];
    let result = miningResources;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(r => 
        (r.commodities as any)?.name?.toLowerCase().includes(q) || 
        r.star_system?.toLowerCase().includes(q)
      );
    }
    if (rarityFilter !== 'all') result = result.filter(r => r.rarity === rarityFilter);
    if (systemFilter !== 'all') result = result.filter(r => r.star_system === systemFilter);
    return result;
  }, [miningResources, search, rarityFilter, systemFilter]);

  const getRarityColor = (rarity: string | null) => {
    switch (rarity) {
      case 'common': return 'bg-muted text-muted-foreground';
      case 'uncommon': return 'bg-green-600/20 text-green-400 border-green-600/30';
      case 'rare': return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      case 'very_rare': return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getRatingStars = (rating: number | null) => {
    if (!rating) return '—';
    return '★'.repeat(rating) + '☆'.repeat(3 - rating);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-amber-400 to-primary bg-clip-text text-transparent">
          Mining & Raffinage
        </h1>
        <p className="text-muted-foreground text-sm">
          Ressources minières, méthodes de raffinage et rendements • Données UEX
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-border pb-2">
        <Button variant={activeTab === 'resources' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('resources')} className="gap-2">
          <Mountain className="w-4 h-4" /> Ressources
        </Button>
        <Button variant={activeTab === 'methods' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('methods')} className="gap-2">
          <FlaskConical className="w-4 h-4" /> Méthodes
        </Button>
        <Button variant={activeTab === 'yields' ? 'default' : 'ghost'} size="sm" onClick={() => setActiveTab('yields')} className="gap-2">
          <Factory className="w-4 h-4" /> Rendements
        </Button>
      </div>

      {activeTab === 'resources' && (
        <>
          <Card className="bg-card/60 border-border/50">
            <CardContent className="p-4">
              <div className="flex flex-col md:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Rechercher une ressource..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-background/50" />
                </div>
                <Select value={rarityFilter} onValueChange={setRarityFilter}>
                  <SelectTrigger className="w-full md:w-[160px] bg-background/50"><SelectValue placeholder="Rareté" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes raretés</SelectItem>
                    <SelectItem value="common">Commun</SelectItem>
                    <SelectItem value="uncommon">Peu commun</SelectItem>
                    <SelectItem value="rare">Rare</SelectItem>
                    <SelectItem value="very_rare">Très rare</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={systemFilter} onValueChange={setSystemFilter}>
                  <SelectTrigger className="w-full md:w-[180px] bg-background/50"><SelectValue placeholder="Système" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous systèmes</SelectItem>
                    {systems.map(s => <SelectItem key={s} value={s!}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card/60 border-border/50 overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/50">
                    <TableHead>Ressource</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Système</TableHead>
                    <TableHead>Planète / Lune</TableHead>
                    <TableHead className="text-right">Concentration</TableHead>
                    <TableHead>Rareté</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingResources ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i} className="border-border/30">
                        <TableCell colSpan={6}><div className="h-6 bg-muted/30 rounded animate-pulse" /></TableCell>
                      </TableRow>
                    ))
                  ) : filteredResources.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                        {miningResources?.length === 0 ? "Aucune donnée. Lance la sync mining depuis l'admin." : "Aucun résultat."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredResources.map((resource) => (
                      <TableRow key={resource.id} className="border-border/30 hover:bg-muted/20">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <Gem className="w-4 h-4 text-amber-400" />
                            {(resource.commodities as any)?.name || 'Unknown'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">{resource.location_type || 'N/A'}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{resource.star_system || '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{resource.planet || resource.moon || '—'}</TableCell>
                        <TableCell className="text-right font-mono">
                          {resource.concentration_pct ? `${resource.concentration_pct}%` : '—'}
                        </TableCell>
                        <TableCell>
                          {resource.rarity ? (
                            <Badge className={`text-xs ${getRarityColor(resource.rarity)}`}>{resource.rarity}</Badge>
                          ) : '—'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}

      {activeTab === 'methods' && (
        <Card className="bg-card/60 border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead>Méthode</TableHead>
                  <TableHead className="text-center"><div className="flex items-center justify-center gap-1"><Gem className="w-4 h-4" /> Rendement</div></TableHead>
                  <TableHead className="text-center"><div className="flex items-center justify-center gap-1"><Coins className="w-4 h-4" /> Coût</div></TableHead>
                  <TableHead className="text-center"><div className="flex items-center justify-center gap-1"><Timer className="w-4 h-4" /> Vitesse</div></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!refineryMethods || refineryMethods.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                      Aucune méthode. Lance la sync mining.
                    </TableCell>
                  </TableRow>
                ) : (
                  refineryMethods.map((method) => (
                    <TableRow key={method.id} className="border-border/30 hover:bg-muted/20">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FlaskConical className="w-4 h-4 text-accent" />
                          {method.name}
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-amber-400">{getRatingStars(Number(method.yield_modifier))}</TableCell>
                      <TableCell className="text-center text-destructive">{getRatingStars(Number(method.cost_modifier))}</TableCell>
                      <TableCell className="text-center text-accent">{getRatingStars(Number(method.duration_modifier))}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {activeTab === 'yields' && (
        <Card className="bg-card/60 border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead>Ressource</TableHead>
                  <TableHead>Raffinerie</TableHead>
                  <TableHead>Système</TableHead>
                  <TableHead className="text-right">Rendement %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingYields || !refineryYields || refineryYields.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-12">
                      Aucune donnée de rendement. Lance la sync mining.
                    </TableCell>
                  </TableRow>
                ) : (
                  refineryYields.slice(0, 100).map((y) => (
                    <TableRow key={y.id} className="border-border/30 hover:bg-muted/20">
                      <TableCell className="font-medium">{(y.commodities as any)?.name || '—'}</TableCell>
                      <TableCell>{(y.terminals as any)?.name || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{(y.terminals as any)?.star_system || '—'}</TableCell>
                      <TableCell className="text-right font-mono text-accent">
                        {y.yield_pct != null ? `${y.yield_pct}%` : '—'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Données fournies par UEX Corp • Les rendements sont des moyennes communautaires
      </p>
    </div>
  );
}
