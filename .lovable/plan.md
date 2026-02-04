
# Plan d'Amélioration Complète - Récupération des Données de Vaisseaux

## Diagnostic Approfondi

### Problèmes Identifiés

| Problème | Impact | Données Actuelles |
|----------|--------|------------------|
| **Slug Matching défaillant** | 70 vaisseaux sans données FleetYards | `a2-hercules-starlifter` ≠ `a2-hercules` |
| **production_status toujours null** | 0/261 vaisseaux avec statut | Impossible de filtrer concept/flight ready |
| **Manufacturer manquant** | 70 vaisseaux sans fabricant | 191/261 seulement |
| **Images gallery incomplètes** | 98 vaisseaux sans galerie | 163/261 seulement |
| **Pas de source Star Citizen Wiki API** | Données de fallback manquantes | Uniquement parsing HTML wikitext |

### État Actuel des Données (261 vaisseaux)
- ✅ 261 avec armament/systems
- ✅ 253 avec image principale
- ✅ 247 avec size
- ✅ 242 avec role
- ❌ 191 avec manufacturer (70 manquants)
- ❌ 191 avec données FleetYards complètes
- ❌ 163 avec galerie d'images
- ❌ 0 avec production_status

---

## Plan d'Amélioration

### Phase 1 : Amélioration du Slug Matching

**Fichier** : `supabase/functions/ships-sync/index.ts`

**Problème actuel** : Le matching cherche `a2-hercules-starlifter` mais FleetYards utilise `a2-hercules`.

**Solution** : Algorithme de matching amélioré en 5 étapes :

```text
1. Exact match           : "constellation-andromeda" → "constellation-andromeda" ✓
2. Simplified match      : "a2-hercules-starlifter" → "a2-hercules" ✓
3. Manufacturer prefix   : "crusader-a2-hercules" (try with manufacturer)
4. Fuzzy match           : Levenshtein distance < 3
5. Partial contains      : Si le slug FY contient le nom de base
```

**Nouvelles règles de normalisation** :
- Retirer "starlifter", "edition", "replica", "variant" du slug
- Essayer avec/sans préfixe manufacturer
- Gérer les cas spéciaux (F7C → f7c-hornet, Ares Inferno → ares-inferno)

### Phase 2 : Intégration de Star Citizen Wiki API v2

**Nouvelle source** : `https://api.star-citizen.wiki/api/v2/vehicles`

Cette API officielle fournit des données structurées JSON incluant :
- ✅ `production_status` (flight-ready, concept, in-production)
- ✅ `manufacturer` avec code et nom
- ✅ `foci` (roles) multilingues
- ✅ `pledge_url` vers RSI
- ✅ `skus` avec prix actuels
- ✅ Dimensions et specs précises

**Hiérarchie des sources (priorité)** :
```text
┌─────────────────────────────────────────────────────────────┐
│ 1. Star Citizen Wiki API v2 (données de base + statut)      │
│    → manufacturer, production_status, prices, dimensions    │
│                                                             │
│ 2. FleetYards API (données enrichies)                       │
│    → images, videos, hardpoints, loaners, modules           │
│                                                             │
│ 3. Wiki HTML Parsing (fallback)                             │
│    → armament, systems si non disponible ailleurs           │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3 : Mapping Automatique des Slugs

**Nouvelle table** : Mapping automatique Wiki → FleetYards

Les vaisseaux problématiques seront mappés automatiquement :
- `a2-hercules-starlifter` → `a2-hercules`
- `c2-hercules-starlifter` → `c2-hercules`
- `m2-hercules-starlifter` → `m2-hercules`
- `ares-star-fighter-inferno` → `ares-inferno`
- `ares-star-fighter-ion` → `ares-ion`
- etc.

**Algorithme de génération** :
1. Fetch la liste complète des slugs FleetYards
2. Pour chaque vaisseau Wiki sans match, appliquer les transformations
3. Stocker le mapping validé dans `ship_slug_mappings`

### Phase 4 : Récupération du Production Status

**Modifications** :
1. Utiliser l'API Star Citizen Wiki v2 pour `production_status`
2. Normaliser les valeurs : `flight-ready`, `concept`, `in-production`, `announced`
3. Enrichir avec FleetYards si disponible

**Champs à récupérer de l'API Wiki v2** :
```typescript
interface WikiAPIVehicle {
  name: string;
  slug: string;
  production_status: { en_EN: string };  // "flight-ready" | "concept" | etc.
  manufacturer: { code: string; name: string };
  sizes: { length: number; beam: number; height: number };
  cargo_capacity: number;
  crew: { min: number; max: number };
  speed: { scm: number; max: number };
  foci: Array<{ en_EN: string }>;  // Roles
  msrp: number;  // Prix en USD
  pledge_url: string;
}
```

### Phase 5 : Optimisation des Performances

**Améliorations** :
1. **Batch API Wiki v2** : Récupérer tous les vaisseaux en une seule requête (`/api/v2/vehicles`)
2. **Cache intelligent** : 
   - Données de base Wiki API : cache 24h
   - Données enrichies FleetYards : cache 7 jours
3. **Parallel Processing** : Maintenir le batch de 5 pour FleetYards
4. **Skip sur hash unchanged** : Ne pas re-fetcher si les données sont identiques

### Phase 6 : Amélioration de l'Interface

**Modifications UI** :
1. **Filtre par statut** : Ajouter un 4ème filtre (Concept / In Production / Flight Ready)
2. **Badge de statut** : Afficher le statut de production sur chaque carte
3. **Indicateur de complétude** : Montrer si les données sont complètes ou partielles
4. **Date de mise à jour** : Afficher quand les données ont été synchronisées

---

## Détails Techniques

### Nouvelle fonction de matching améliorée

```typescript
function findBestFleetYardsSlugImproved(
  wikiTitle: string, 
  fleetYardsSlugs: string[],
  manufacturer?: string
): string | null {
  // Normalisation du titre
  const baseSlug = wikiTitle.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  
  // 1. Exact match
  if (fleetYardsSlugs.includes(baseSlug)) return baseSlug;
  
  // 2. Simplification (retirer suffixes communs)
  const suffixesToRemove = [
    '-starlifter', '-edition', '-replica', '-variant',
    '-pirate-edition', '-best-in-show-edition', '-emerald',
    '-executive', '-expedition', '-rescue'
  ];
  let simplified = baseSlug;
  for (const suffix of suffixesToRemove) {
    if (simplified.endsWith(suffix)) {
      simplified = simplified.slice(0, -suffix.length);
      break;
    }
  }
  if (fleetYardsSlugs.includes(simplified)) return simplified;
  
  // 3. Préfixes à retirer (star-fighter, etc.)
  const prefixPatterns = [
    /^(ares-star-fighter-)/,  // ares-star-fighter-inferno → ares-inferno
    /^(avenger-)/,            // Garder avenger-
  ];
  for (const pattern of prefixPatterns) {
    const match = simplified.match(pattern);
    if (match) {
      const withoutPrefix = simplified.replace(pattern, '');
      const trySlug = `ares-${withoutPrefix}`;
      if (fleetYardsSlugs.includes(trySlug)) return trySlug;
    }
  }
  
  // 4. Recherche par contains
  const candidates = fleetYardsSlugs.filter(s => 
    s.includes(simplified) || simplified.includes(s)
  );
  if (candidates.length === 1) return candidates[0];
  
  // 5. Fuzzy matching (Levenshtein)
  const threshold = 3;
  for (const fySlug of fleetYardsSlugs) {
    if (levenshteinDistance(simplified, fySlug) <= threshold) {
      return fySlug;
    }
  }
  
  return null;
}
```

### Intégration Star Citizen Wiki API v2

```typescript
async function fetchWikiAPIVehicles(): Promise<Map<string, WikiVehicle>> {
  const response = await fetch('https://api.star-citizen.wiki/api/v2/vehicles');
  const json = await response.json();
  
  const vehicleMap = new Map();
  for (const vehicle of json.data) {
    // Créer un slug compatible
    const slug = vehicle.slug.toLowerCase();
    vehicleMap.set(slug, {
      name: vehicle.name,
      manufacturer: vehicle.manufacturer?.name,
      production_status: vehicle.production_status?.en_EN,
      crew_min: vehicle.crew?.min,
      crew_max: vehicle.crew?.max,
      cargo_scu: vehicle.cargo_capacity,
      length_m: vehicle.sizes?.length,
      beam_m: vehicle.sizes?.beam || vehicle.dimension?.width,
      height_m: vehicle.sizes?.height,
      scm_speed: vehicle.speed?.scm,
      role: vehicle.foci?.[0]?.en_EN,
      msrp: vehicle.msrp,
      pledge_url: vehicle.pledge_url
    });
  }
  return vehicleMap;
}
```

### Nouveau flux de synchronisation

```text
┌────────────────────────────────────────────────────────────────────┐
│                        SHIPS-SYNC OPTIMISÉ                         │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  1. FETCH SOURCES EN PARALLÈLE                                     │
│     ├── Wiki API v2 → /api/v2/vehicles (tous les vaisseaux)       │
│     ├── FleetYards slugs → /v1/models/slugs                        │
│     └── Wiki Category → Ships list (fallback)                      │
│                                                                    │
│  2. CRÉER MAPPING SLUG                                             │
│     Pour chaque vaisseau Wiki API :                                │
│     → Trouver le meilleur slug FleetYards (algorithme amélioré)    │
│     → Stocker dans ship_slug_mappings si nouveau                   │
│                                                                    │
│  3. ENRICHIR PAR BATCH                                             │
│     Par lots de 5 vaisseaux en parallèle :                         │
│     ├── Si cache FleetYards < 7j → skip enrichment                 │
│     └── Sinon → fetch images, videos, loaners, modules             │
│                                                                    │
│  4. UPSERT DATABASE                                                │
│     └── Combiner : Wiki API v2 + FleetYards + Wiki HTML parsing    │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Résultats Attendus

| Métrique | Avant | Après |
|----------|-------|-------|
| Vaisseaux avec manufacturer | 191/261 (73%) | 261/261 (100%) |
| Vaisseaux avec production_status | 0/261 (0%) | ~250/261 (95%+) |
| Vaisseaux avec données FleetYards | 191/261 (73%) | ~240/261 (92%+) |
| Vaisseaux avec galerie images | 163/261 (62%) | ~220/261 (85%+) |
| Temps de sync complète | ~15-20 min | ~10-15 min |
| Taux de matching FleetYards | 73% | 92%+ |

---

## Fichiers à Modifier

1. **`supabase/functions/ships-sync/index.ts`**
   - Ajouter intégration Star Citizen Wiki API v2
   - Améliorer l'algorithme de slug matching
   - Ajouter fonction Levenshtein distance
   - Optimiser le flux avec données de base en premier

2. **`src/pages/Ships.tsx`**
   - Ajouter filtre par production_status
   - Afficher badge de statut sur les cartes

3. **`src/components/ShipCard.tsx`**
   - Ajouter badge Concept/In Production/Flight Ready
   - Améliorer l'affichage des informations manquantes

4. **Nouvelles traductions**
   - Ajouter clés pour les statuts de production

---

## Ordre d'Exécution

1. ✏️ Modifier `ships-sync/index.ts` avec les améliorations
2. ✏️ Ajouter le filtre statut dans `Ships.tsx`
3. ✏️ Améliorer `ShipCard.tsx` avec badges de statut
4. 🚀 Déployer et tester
5. ▶️ Lancer une sync complète pour valider
