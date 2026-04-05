import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Target, Truck, Pickaxe, Shield, Wrench, Eye, Swords, ArrowUpDown, AlertTriangle, Users, Star, Repeat } from 'lucide-react';

export default function Missions() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [legalityFilter, setLegalityFilter] = useState<string>('all');
  const [threatFilter, setThreatFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'title' | 'reward_auec' | 'combat_threat'>('reward_auec');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const { data: missions, isLoading } = useQuery({
    queryKey: ['missions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('missions')
        .select('*')
        .order('reward_auec', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const categories = useMemo(() => {
    if (!missions) return [];
    return Array.from(new Set(missions.map(m => m.category).filter(Boolean))).sort();
  }, [missions]);

  const filtered = useMemo(() => {
    if (!missions) return [];
    let result = missions;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m => m.title.toLowerCase().includes(q) || m.faction?.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') result = result.filter(m => m.category === categoryFilter);
    if (legalityFilter === 'legal') result = result.filter(m => !m.is_illegal);
    else if (legalityFilter === 'illegal') result = result.filter(m => m.is_illegal);
    if (threatFilter !== 'all') result = result.filter(m => m.combat_threat === threatFilter);

    result = [...result].sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(String(valB)) : String(valB).localeCompare(valA);
      return sortDir === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
    return result;
  }, [missions, search, categoryFilter, legalityFilter, threatFilter, sortField, sortDir]);

  const getCategoryIcon = (cat: string | null) => {
    switch (cat) {
      case 'bounty': return <Target className="w-4 h-4 text-destructive" />;
      case 'delivery': return <Truck className="w-4 h-4 text-accent" />;
      case 'mining': return <Pickaxe className="w-4 h-4 text-amber-400" />;
      case 'mercenary': return <Swords className="w-4 h-4 text-primary" />;
      case 'salvage': return <Wrench className="w-4 h-4 text-muted-foreground" />;
      case 'investigation': return <Eye className="w-4 h-4 text-blue-400" />;
      case 'escort': return <Shield className="w-4 h-4 text-green-400" />;
      case 'search_rescue': return <Users className="w-4 h-4 text-cyan-400" />;
      case 'maintenance': return <Wrench className="w-4 h-4 text-orange-400" />;
      default: return <Star className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getCategoryColor = (cat: string | null) => {
    switch (cat) {
      case 'bounty': return 'bg-red-600/20 text-red-400 border-red-600/30';
      case 'delivery': return 'bg-cyan-600/20 text-cyan-400 border-cyan-600/30';
      case 'mining': return 'bg-amber-600/20 text-amber-400 border-amber-600/30';
      case 'mercenary': return 'bg-purple-600/20 text-purple-400 border-purple-600/30';
      case 'salvage': return 'bg-gray-600/20 text-gray-400 border-gray-600/30';
      case 'investigation': return 'bg-blue-600/20 text-blue-400 border-blue-600/30';
      case 'escort': return 'bg-green-600/20 text-green-400 border-green-600/30';
      case 'search_rescue': return 'bg-teal-600/20 text-teal-400 border-teal-600/30';
      case 'maintenance': return 'bg-orange-600/20 text-orange-400 border-orange-600/30';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getThreatBadge = (threat: string | null) => {
    if (!threat) return null;
    const colors: Record<string, string> = {
      very_low: 'bg-green-600/20 text-green-400',
      low: 'bg-lime-600/20 text-lime-400',
      medium: 'bg-yellow-600/20 text-yellow-400',
      high: 'bg-orange-600/20 text-orange-400',
      very_high: 'bg-red-600/20 text-red-400',
      extreme: 'bg-red-800/30 text-red-300',
    };
    return <Badge className={`text-xs ${colors[threat] || 'bg-muted text-muted-foreground'}`}>{threat.replace('_', ' ')}</Badge>;
  };

  const stats = useMemo(() => {
    if (!missions) return { total: 0, bounty: 0, delivery: 0, illegal: 0 };
    return {
      total: missions.length,
      bounty: missions.filter(m => m.category === 'bounty').length,
      delivery: missions.filter(m => m.category === 'delivery').length,
      illegal: missions.filter(m => m.is_illegal).length,
    };
  }, [missions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-accent to-secondary bg-clip-text text-transparent">
          Missions Database
        </h1>
        <p className="text-muted-foreground text-sm">
          Base de données des missions Star Citizen • Types, récompenses, factions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Star className="w-8 h-8 text-primary" />
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Missions</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Target className="w-8 h-8 text-destructive" />
            <div><p className="text-2xl font-bold">{stats.bounty}</p><p className="text-xs text-muted-foreground">Bounties</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Truck className="w-8 h-8 text-accent" />
            <div><p className="text-2xl font-bold">{stats.delivery}</p><p className="text-xs text-muted-foreground">Livraisons</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <div><p className="text-2xl font-bold">{stats.illegal}</p><p className="text-xs text-muted-foreground">Illégales</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Rechercher une mission ou faction..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-background/50" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[170px] bg-background/50"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {categories.map(cat => <SelectItem key={cat} value={cat!}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={legalityFilter} onValueChange={setLegalityFilter}>
              <SelectTrigger className="w-full md:w-[140px] bg-background/50"><SelectValue placeholder="Légalité" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="legal">Légales</SelectItem>
                <SelectItem value="illegal">Illégales</SelectItem>
              </SelectContent>
            </Select>
            <Select value={threatFilter} onValueChange={setThreatFilter}>
              <SelectTrigger className="w-full md:w-[160px] bg-background/50"><SelectValue placeholder="Menace" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toute menace</SelectItem>
                <SelectItem value="very_low">Très faible</SelectItem>
                <SelectItem value="low">Faible</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="very_high">Très haute</SelectItem>
                <SelectItem value="extreme">Extrême</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Mission cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="bg-card/60 border-border/50">
              <CardContent className="p-6"><div className="h-24 bg-muted/30 rounded animate-pulse" /></CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="bg-card/60 border-border/50">
          <CardContent className="py-12 text-center text-muted-foreground">
            {missions?.length === 0 ? "Aucune mission. Lance la sync depuis l'admin." : "Aucun résultat pour ces filtres."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((mission) => (
            <Card key={mission.id} className="bg-card/60 border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {getCategoryIcon(mission.category)}
                    <h3 className="font-semibold text-sm truncate">{mission.title}</h3>
                  </div>
                  {mission.is_illegal && <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge className={`text-xs ${getCategoryColor(mission.category)}`}>{mission.category}</Badge>
                  {getThreatBadge(mission.combat_threat)}
                  {mission.rank_required && mission.rank_required !== 'None' && (
                    <Badge variant="outline" className="text-xs">{mission.rank_required}</Badge>
                  )}
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{mission.faction || '—'}</span>
                  <span className="font-mono font-bold text-accent">
                    {mission.reward_auec ? `${mission.reward_auec.toLocaleString()} aUEC` : '—'}
                  </span>
                </div>

                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">📍 {mission.star_system || '—'}</span>
                  {mission.is_shareable && <span className="flex items-center gap-1"><Users className="w-3 h-3" /> Partageable</span>}
                  {mission.is_repeatable && <span className="flex items-center gap-1"><Repeat className="w-3 h-3" /> Répétable</span>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center">
        Données basées sur les missions connues de Star Citizen • Mises à jour à chaque patch
      </p>
    </div>
  );
}
