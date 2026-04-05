import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { Search, ArrowUpDown, Sword, Shield, Cpu, Apple, Pill, Wrench, Package } from 'lucide-react';

type SortField = 'name' | 'category' | 'manufacturer' | 'buy_price_avg' | 'sell_price_avg';

export default function Items() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [manufacturerFilter, setManufacturerFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const { data: items, isLoading } = useQuery({
    queryKey: ['game-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('game_items')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const categories = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map(i => i.category).filter(Boolean))).sort();
  }, [items]);

  const manufacturers = useMemo(() => {
    if (!items) return [];
    return Array.from(new Set(items.map(i => i.manufacturer).filter(Boolean))).sort();
  }, [items]);

  const filtered = useMemo(() => {
    if (!items) return [];
    let result = items;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(i => i.name.toLowerCase().includes(q) || i.manufacturer?.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') result = result.filter(i => i.category === categoryFilter);
    if (manufacturerFilter !== 'all') result = result.filter(i => i.manufacturer === manufacturerFilter);

    result = [...result].sort((a, b) => {
      const valA = a[sortField] ?? '';
      const valB = b[sortField] ?? '';
      if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(String(valB)) : String(valB).localeCompare(valA);
      return sortDir === 'asc' ? Number(valA) - Number(valB) : Number(valB) - Number(valA);
    });
    return result;
  }, [items, search, categoryFilter, manufacturerFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const getCategoryIcon = (cat: string | null) => {
    const c = cat?.toLowerCase() || '';
    if (c.includes('weapon') || c.includes('gun')) return <Sword className="w-4 h-4 text-destructive" />;
    if (c.includes('armor') || c.includes('helmet') || c.includes('undersuit')) return <Shield className="w-4 h-4 text-accent" />;
    if (c.includes('component') || c.includes('power') || c.includes('cooler') || c.includes('quantum')) return <Cpu className="w-4 h-4 text-primary" />;
    if (c.includes('food') || c.includes('drink')) return <Apple className="w-4 h-4 text-green-400" />;
    if (c.includes('medical') || c.includes('drug')) return <Pill className="w-4 h-4 text-blue-400" />;
    if (c.includes('tool') || c.includes('utility')) return <Wrench className="w-4 h-4 text-amber-400" />;
    return <Package className="w-4 h-4 text-muted-foreground" />;
  };

  const formatPrice = (price: number | null) => {
    if (!price) return '—';
    return `${Number(price).toLocaleString()} aUEC`;
  };

  const stats = useMemo(() => {
    if (!items) return { total: 0, withPrice: 0, categories: 0 };
    return {
      total: items.length,
      withPrice: items.filter(i => i.buy_price_avg || i.sell_price_avg).length,
      categories: new Set(items.map(i => i.category).filter(Boolean)).size,
    };
  }, [items]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-secondary to-primary bg-clip-text text-transparent">
          Items Database
        </h1>
        <p className="text-muted-foreground text-sm">
          Armes, armures, composants et équipements Star Citizen • Données UEX
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Package className="w-8 h-8 text-primary" />
            <div><p className="text-2xl font-bold">{stats.total}</p><p className="text-xs text-muted-foreground">Objets</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Cpu className="w-8 h-8 text-accent" />
            <div><p className="text-2xl font-bold">{stats.categories}</p><p className="text-xs text-muted-foreground">Catégories</p></div>
          </CardContent>
        </Card>
        <Card className="bg-card/60 border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <Sword className="w-8 h-8 text-secondary" />
            <div><p className="text-2xl font-bold">{stats.withPrice}</p><p className="text-xs text-muted-foreground">Avec prix</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card/60 border-border/50">
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Rechercher un objet..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-background/50" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background/50"><SelectValue placeholder="Catégorie" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes catégories</SelectItem>
                {categories.map(cat => <SelectItem key={cat} value={cat!}>{cat}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={manufacturerFilter} onValueChange={setManufacturerFilter}>
              <SelectTrigger className="w-full md:w-[180px] bg-background/50"><SelectValue placeholder="Fabricant" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous fabricants</SelectItem>
                {manufacturers.map(m => <SelectItem key={m} value={m!}>{m}</SelectItem>)}
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
                <TableHead>
                  <Button variant="ghost" size="sm" onClick={() => toggleSort('manufacturer')} className="gap-1 -ml-3">
                    Fabricant <ArrowUpDown className="w-3 h-3" />
                  </Button>
                </TableHead>
                <TableHead>Taille</TableHead>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <TableRow key={i} className="border-border/30">
                    <TableCell colSpan={6}><div className="h-6 bg-muted/30 rounded animate-pulse" /></TableCell>
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
                    {items?.length === 0 ? "Aucun objet. Lance la sync items depuis l'admin." : "Aucun résultat."}
                  </TableCell>
                </TableRow>
              ) : (
                filtered.slice(0, 200).map((item) => (
                  <TableRow key={item.id} className="border-border/30 hover:bg-muted/20">
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {getCategoryIcon(item.category)}
                        <span className="truncate max-w-[250px]">{item.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{item.category || 'N/A'}</Badge>
                      {item.sub_category && item.sub_category !== item.category && (
                        <Badge variant="outline" className="text-xs ml-1">{item.sub_category}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{item.manufacturer || '—'}</TableCell>
                    <TableCell>
                      {item.size && <Badge variant="outline" className="text-xs">{item.size}</Badge>}
                      {item.grade && <Badge variant="outline" className="text-xs ml-1">{item.grade}</Badge>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-400">
                      {formatPrice(Number(item.buy_price_avg))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-accent">
                      {formatPrice(Number(item.sell_price_avg))}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        {filtered.length > 200 && (
          <div className="p-4 text-center text-sm text-muted-foreground border-t border-border/30">
            Affichage des 200 premiers résultats sur {filtered.length}
          </div>
        )}
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        Données fournies par UEX Corp • Les prix sont des moyennes communautaires
      </p>
    </div>
  );
}
