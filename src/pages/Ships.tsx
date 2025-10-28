import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { ShipCard } from '@/components/ShipCard';
import { Search } from 'lucide-react';

export default function Ships() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [manufacturerFilter, setManufacturerFilter] = useState('all');
  const [roleFilter, setRoleFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  
  const { data: ships, isLoading } = useQuery({
    queryKey: ['ships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ships')
        .select('*')
        .order('name');
      
      if (error) throw error;
      return data;
    },
  });

  const manufacturers = useMemo(() => {
    if (!ships) return [];
    const unique = new Set(ships.map(s => s.manufacturer).filter(Boolean));
    return Array.from(unique).sort();
  }, [ships]);

  const roles = useMemo(() => {
    if (!ships) return [];
    const unique = new Set(ships.map(s => s.role).filter(Boolean));
    return Array.from(unique).sort();
  }, [ships]);

  const sizes = useMemo(() => {
    if (!ships) return [];
    const unique = new Set(ships.map(s => s.size).filter(Boolean));
    return Array.from(unique).sort();
  }, [ships]);

  const filteredShips = useMemo(() => {
    if (!ships) return [];
    return ships.filter(ship => {
      const matchesSearch = ship.name.toLowerCase().includes(search.toLowerCase());
      const matchesManufacturer = manufacturerFilter === 'all' || ship.manufacturer === manufacturerFilter;
      const matchesRole = roleFilter === 'all' || ship.role === roleFilter;
      const matchesSize = sizeFilter === 'all' || ship.size === sizeFilter;
      return matchesSearch && matchesManufacturer && matchesRole && matchesSize;
    });
  }, [ships, search, manufacturerFilter, roleFilter, sizeFilter]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <h1 className="text-4xl font-bold">{t('ships.title')}</h1>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-96 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-2">{t('ships.title')}</h1>
        <p className="text-sm sm:text-base text-muted-foreground">{t('home.features.ships.description')}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="relative sm:col-span-2 md:col-span-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('ships.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Select value={manufacturerFilter} onValueChange={setManufacturerFilter}>
          <SelectTrigger className="text-sm sm:text-base">
            <SelectValue placeholder={t('ships.filterByManufacturer')} />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {manufacturers.map(m => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="text-sm sm:text-base">
            <SelectValue placeholder={t('ships.filterByRole')} />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {roles.map(r => (
              <SelectItem key={r} value={r}>{r}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sizeFilter} onValueChange={setSizeFilter}>
          <SelectTrigger className="text-sm sm:text-base">
            <SelectValue placeholder={t('ships.filterBySize')} />
          </SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {sizes.map(s => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filteredShips.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm sm:text-base text-muted-foreground">{t('ships.noResults')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {filteredShips.map((ship) => (
            <ShipCard key={ship.id} ship={ship} />
          ))}
        </div>
      )}
    </div>
  );
}
