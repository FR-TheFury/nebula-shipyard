import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';
import { ShipCard } from '@/components/ShipCard';
import { Search } from 'lucide-react';

// Normalize role to extract base role (remove prefixes like "Heavy", "Light", "Medium", "Stealth", etc.)
function normalizeRole(role: string | null): string[] {
  if (!role || role === '(to be announced)' || role === 'Unknown') return [];
  
  // Clean up the role (trim and normalize case)
  const cleaned = role.trim();
  if (!cleaned) return [];
  
  // Split composite roles (e.g., "Starter / touring" -> ["Starter", "Touring"])
  const parts = cleaned.split(/\s*\/\s*/).map(p => p.trim()).filter(Boolean);
  
  // Normalize each part
  const normalized = parts.map(part => {
    // Capitalize first letter of each word
    return part.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  });
  
  return normalized;
}

// Extract base role category (without size modifiers)
function getBaseRole(role: string): string {
  // Remove size/weight prefixes
  const prefixes = ['Heavy', 'Light', 'Medium', 'Stealth', 'Snub', 'Armored', 'Modular'];
  let baseRole = role;
  
  for (const prefix of prefixes) {
    if (baseRole.toLowerCase().startsWith(prefix.toLowerCase() + ' ')) {
      baseRole = baseRole.substring(prefix.length + 1).trim();
      break;
    }
  }
  
  // Capitalize
  return baseRole.charAt(0).toUpperCase() + baseRole.slice(1).toLowerCase();
}

// Main role categories for filtering
const MAIN_ROLES = [
  'Bomber',
  'Cargo',
  'Carrier',
  'Combat',
  'Construction',
  'Corvette',
  'Cruiser',
  'Destroyer',
  'Dropship',
  'Expedition',
  'Exploration',
  'Fighter',
  'Freight',
  'Frigate',
  'Gunship',
  'Interdiction',
  'Luxury',
  'Medical',
  'Mining',
  'Pathfinder',
  'Racing',
  'Refinery',
  'Repair',
  'Salvage',
  'Science',
  'Starter',
  'Touring',
  'Transport',
];

// Size order for sorting
const SIZE_ORDER = ['Snub', 'Small', 'Medium', 'Large', 'Capital'];

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

  // Get available main roles from the data
  const roles = useMemo(() => {
    if (!ships) return [];
    
    const roleSet = new Set<string>();
    
    ships.forEach(ship => {
      if (!ship.role) return;
      
      // Get the base role (without Heavy/Light/Medium prefix)
      const baseRoles = normalizeRole(ship.role);
      baseRoles.forEach(br => {
        const base = getBaseRole(br);
        // Check if it matches or is close to a main role
        const matchedMain = MAIN_ROLES.find(main => 
          base.toLowerCase().includes(main.toLowerCase()) ||
          main.toLowerCase().includes(base.toLowerCase())
        );
        if (matchedMain) {
          roleSet.add(matchedMain);
        } else if (base && base.length > 2) {
          // Add as-is if it's a valid role
          roleSet.add(base);
        }
      });
    });
    
    return Array.from(roleSet).sort();
  }, [ships]);

  const sizes = useMemo(() => {
    if (!ships) return [];
    const unique = new Set(
      ships
        .map(s => s.size?.trim())
        .filter((s): s is string => Boolean(s))
    );
    // Sort by SIZE_ORDER
    return Array.from(unique).sort((a, b) => {
      const indexA = SIZE_ORDER.indexOf(a);
      const indexB = SIZE_ORDER.indexOf(b);
      if (indexA === -1 && indexB === -1) return a.localeCompare(b);
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  }, [ships]);

  const filteredShips = useMemo(() => {
    if (!ships) return [];
    return ships.filter(ship => {
      const matchesSearch = ship.name.toLowerCase().includes(search.toLowerCase());
      const matchesManufacturer = manufacturerFilter === 'all' || ship.manufacturer === manufacturerFilter;
      
      // Role matching - check if the ship's role contains the selected main role
      let matchesRole = roleFilter === 'all';
      if (!matchesRole && ship.role) {
        const shipBaseRoles = normalizeRole(ship.role).map(r => getBaseRole(r).toLowerCase());
        matchesRole = shipBaseRoles.some(br => 
          br.includes(roleFilter.toLowerCase()) ||
          roleFilter.toLowerCase().includes(br)
        );
      }
      
      const matchesSize = sizeFilter === 'all' || ship.size?.trim() === sizeFilter;
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

      <div className="text-sm text-muted-foreground">
        {filteredShips.length} {t('ships.results', { count: filteredShips.length })}
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
