import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, TrendingUp, TrendingDown, Package, Filter, ArrowUpDown, Gem, Flame, Leaf, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type SortField = 'name' | 'category' | 'buy_price_avg' | 'sell_price_avg' | 'profit';
type SortDir = 'asc' | 'desc';

export default function Commodities() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [showIllegal, setShowIllegal] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const { data: commodities, isLoading } = useQuery({
    queryKey: ['commodities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commodities')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const categories = useMemo(() => {
    if (!commodities) return [];
    const cats = new Set(commodities.map(c => c.category).filter(Boolean));
    return Array.from(cats).sort();
  }, [commodities]);

  const filtered = useMemo(() => {
    if (!commodities) return [];
    let result = commodities;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(c => c.name.toLowerCase().includes(q) || c.code?.toLowerCase().includes(q));
    }
    if (category !== 'all') {
      result = result.filter(c => c.category === category);
    }
    if (showIllegal === 'legal') {
      result = result.filter(c => !c.is_illegal);
    } else if (showIllegal === 'illegal') {
      result = result.filter(c => c.is_illegal);
    }

    result = [...result].sort((a, b) => {
      let valA: any, valB: any;
      if (sortField === 'profit') {
        valA = (Number(a.sell_price_avg) || 0) - (Number(a.buy_price_avg) || 0);
        valB = (Number(b.sell_price_avg) || 0) - (Number(b.buy_price_avg) || 0);
      } else {
        valA = a[sortField];
        valB = b[sortField];
      }
      if (valA == null) return 1;
      if (valB == null) return -1;
      if (typeof valA === 'string') {
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      }
      return sortDir === 'asc' ? valA - valB : valB - valA;
    });

    return result;
  }, [commodities, search, category, showIllegal, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '—';
    return `${Number(price).toLocaleString()} aUEC`;
  };

  const getCategoryIcon = (cat: string | null) => {
    switch (cat) {
      case 'Metal': case 'mineral': return <Gem className="w-4 h-4" />;
      case 'Gas': case 'halogen': return <Flame className="w-4 h-4" />;
      case 'Agricultural': case 'food': return <Leaf className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const stats = useMemo(() => {
    if (!commodities) return { total: 0, illegal: 0, harvestable: 0, raw: 0 };
    return {
      total: commodities.length,
      illegal: commodities.filter(c => c.is_illegal).length,
      harvestable: commodities.filter(c => c.is_harvestable).length,
      raw: commodities.filter(c => c.is_raw).length,
    };
  }, [commodities]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Commodities & Resources
        </h1>
        <p className="text-muted-foreground text-sm">
          Prix en temps réel des commodités Star Citizen • Données UEX
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Commodités</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Gem className="w-8 h-8 text-accent" />
            <div>
              <p className="text-2xl font-bold">{stats.raw}</p>
              <p className="text-xs text-muted-foreground">Matières brutes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Leaf className="w-8 h-8 text-green-400" />
            <div>
              <p className="text-2xl font-bold">{stats.harvestable}</p>
              <p className="text-xs text-muted-foreground">Récoltables</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-8 h-8 text-destructive" />
            <div>
              <p className="text-2xl font-bold">{stats.illegal}</p>
              <p className="text-xs text-muted-foreground">Illégales</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher une commodité..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 bg-background/50"
              />
            </div>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="w-full md:w-[180px] bg-background/50">
                <SelectValue placeholder="Catégorie" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat!}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={showIllegal} onValueChange={setShowIllegal}>
              <SelectTrigger className="w-full md:w-[150px] bg-background/50">
                <SelectValue placeholder="Légalité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="legal">Légales</SelectItem>
                <SelectItem value="illegal">Illégales</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="bg-card/60 border-border/50 overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('name')} className="gap-1 -ml-3">
                    Nom <ArrowUpDown className="w-3 h-3" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('category')} className="gap-1 -ml-3">
                    Catégorie <ArrowUpDown className="w-3 h-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('buy_price_avg')} className="gap-1">
                    Prix Achat <ArrowUpDown className="w-3 h-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('sell_price_avg')} className="gap-1">
                    Prix Vente <ArrowUpDown className="w-3 h-3" />
                  </Button>
                </TableHead>
                <TableHead className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('profit')} className="gap-1">
                    Profit/SCU <ArrowUpDown className="w-3 h-3" />
                  </Button>
                </TableHead>
                <TableHead>Tags</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell colSpan={6}>
                      <div className="h-6 bg-muted/30 rounded animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    {commodities?.length === 0 
                      ? "Aucune donnée. Lance une sync depuis le panel admin." 
                      : "Aucun résultat pour ces filtres."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((commodity) => {
                  const profit = (Number(commodity.sell_price_avg) || 0) - (Number(commodity.buy_price_avg) || 0);
                  return (
                    <TableRow key={commodity.id} className="border-border/30 hover:bg-muted/20">
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(commodity.category)}
                          <span>{commodity.name}</span>
                          {commodity.code && (
                            <span className="text-xs text-muted-foreground">({commodity.code})</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {commodity.category || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {commodity.buy_price_avg ? (
                          <span className="text-green-400">{formatPrice(Number(commodity.buy_price_avg))}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {commodity.sell_price_avg ? (
                          <span className="text-accent">{formatPrice(Number(commodity.sell_price_avg))}</span>
                        ) : '—'}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {commodity.buy_price_avg && commodity.sell_price_avg ? (
                          <span className={profit > 0 ? 'text-green-400' : 'text-destructive'}>
                            {profit > 0 ? '+' : ''}{profit.toLocaleString()} aUEC
                            {profit > 0 ? <TrendingUp className="w-3 h-3 inline ml-1" /> : <TrendingDown className="w-3 h-3 inline ml-1" />}
                          </span>
                        ) : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {commodity.is_illegal && (
                            <Badge variant="destructive" className="text-xs">Illégal</Badge>
                          )}
                          {commodity.is_raw && (
                            <Badge className="text-xs bg-amber-600/20 text-amber-400 border-amber-600/30">Brut</Badge>
                          )}
                          {commodity.is_harvestable && (
                            <Badge className="text-xs bg-green-600/20 text-green-400 border-green-600/30">Récoltable</Badge>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Données fournies par UEX Corp • Les prix sont des moyennes communautaires
      </p>
    </div>
  );
}
