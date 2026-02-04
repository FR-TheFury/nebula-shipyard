
# Plan d'Amélioration Complète - Composants et Statuts de Production

## Problèmes Identifiés

### 1. Composants Toujours Vides (0/261 ships)
**Cause** : L'endpoint FleetYards `/models/{slug}` ne contient PAS les hardpoints. Il faut appeler l'endpoint séparé `/models/{slug}/hardpoints`.

Le code actuel cherche `fyData.basic.hardpoints` mais la structure FleetYards est :
- `/models/{slug}` → données générales (size, focus, productionStatus, etc.)
- `/models/{slug}/hardpoints` → liste des hardpoints (type, group, size, mount)

**Données FleetYards Hardpoints (exemple Aurora-MR)** :
```json
{
  "id": "xxx",
  "type": "fuel_intakes",    // ← TYPE du composant
  "group": "propulsion",     // ← GROUPE (avionic, propulsion, etc.)
  "size": "small",           // ← TAILLE (small/medium/large)
  "sizeLabel": "S (1)",
  "mount": "1",              // ← Nombre d'emplacements
  "loadouts": []             // ← Composants installés (souvent vide dans ship_matrix)
}
```

### 2. Production Status Manquant (133/261 ships)
**Cause** : Le champ est `productionStatus` (camelCase) dans FleetYards, pas `production_status`.
Le code actuel utilise `fyData?.basic?.production_status` alors qu'il faudrait `fyData?.basic?.productionStatus`.

**Exemple Aurora-MR** :
```json
{
  "productionStatus": "flight-ready",  // ← camelCase !
  "focus": "Light Fighter",
  "size": "small",
  "scmSpeed": 225
}
```

---

## Plan de Correction

### Phase 1 : Appeler l'Endpoint Hardpoints Séparé

**Fichier** : `supabase/functions/ships-sync/index.ts`

**Modifications** :
1. Ajouter un appel à `/models/{slug}/hardpoints` dans `fetchFleetYardsShipData()`
2. Retourner les hardpoints comme champ séparé

```text
AVANT (ne fonctionne pas):
┌────────────────────────────────────────────┐
│ Appel : /models/{slug}                     │
│ Lecture : fyData.basic.hardpoints          │
│ Résultat : undefined (n'existe pas)        │
└────────────────────────────────────────────┘

APRÈS (correct):
┌────────────────────────────────────────────┐
│ Appel 1 : /models/{slug}       → basic     │
│ Appel 2 : /models/{slug}/hardpoints → hp[] │
│ Lecture : hp[] (tableau de hardpoints)     │
│ Résultat : données complètes               │
└────────────────────────────────────────────┘
```

### Phase 2 : Corriger le Mapping des Hardpoints

**Problème actuel** : Les types FleetYards ne correspondent pas au switch/case actuel.

**Types FleetYards réels** :
| Type FleetYards | Groupe FleetYards | Devrait mapper vers |
|-----------------|-------------------|---------------------|
| `weapons` | `weapon` | armament.weapons |
| `turrets` | `weapon` | armament.turrets |
| `missiles` | `weapon` | armament.missiles |
| `countermeasures` | `weapon` | armament.countermeasures |
| `fuel_intakes` | `propulsion` | systems.propulsion.fuel_intakes |
| `fuel_tanks` | `propulsion` | systems.propulsion.fuel_tanks |
| `quantum_drives` | `propulsion` | systems.propulsion.quantum_drives |
| `jump_modules` | `propulsion` | systems.propulsion.jump_modules |
| `quantum_fuel_tanks` | `propulsion` | systems.propulsion.quantum_fuel_tanks |
| `power_plants` | `system` | systems.power.power_plants |
| `coolers` | `system` | systems.power.coolers |
| `shield_generators` | `system` | systems.power.shield_generators |
| `radar` | `avionic` | systems.avionics.radar |
| `computers` | `avionic` | systems.avionics.computer |
| `main_thrusters` | `thruster` | systems.thrusters.main |
| `maneuvering_thrusters` | `thruster` | systems.thrusters.maneuvering |

### Phase 3 : Afficher Slots + Composants Installés

**Structure de données à stocker** :
```typescript
interface HardpointSlot {
  type: string;           // "weapons", "shield_generators", etc.
  group: string;          // "weapon", "system", "propulsion", etc.
  size: string;           // "S1", "S2", "M", "L", etc.
  sizeLabel: string;      // "S (1)", "M (2)", "L (3)"
  count: number;          // Nombre d'emplacements de ce type/taille
  installedComponent?: string;  // Nom du composant installé (si dispo)
}
```

**Affichage sur la page ShipDetail** :
```
┌──────────────────────────────────────────────────┐
│ 🔫 ARMEMENT                                      │
├──────────────────────────────────────────────────┤
│ Weapons:        2x S4  (M65 Laser Cannon)        │
│ Turrets:        2x S2  (Remote Turret)           │
│ Missiles:       24x S2 (Ignite II)               │
│ Countermeasures: 2x S1 (Chaff Launcher)          │
├──────────────────────────────────────────────────┤
│ ⚡ SYSTÈMES                                      │
├──────────────────────────────────────────────────┤
│ Power Plants:   1x S2  (JS-300)                  │
│ Coolers:        2x S1  (Bracer)                  │
│ Shields:        2x S2  (Shimmer)                 │
│ QT Drive:       1x S2  (Voyage)                  │
└──────────────────────────────────────────────────┘
```

### Phase 4 : Corriger la Lecture de productionStatus

**Modifications** :
1. Lire `fyData?.basic?.productionStatus` (camelCase) au lieu de `production_status`
2. Améliorer la normalisation pour matcher les valeurs FleetYards ("flight-ready", "in-production", "in-concept")

```typescript
// AVANT (incorrect)
let finalProductionStatus = normalizeProductionStatus(
  wikiAPIData?.production_status?.en_EN || 
  fyData?.basic?.production_status ||   // ❌ snake_case
  parsed.production_status
);

// APRÈS (correct)
let finalProductionStatus = normalizeProductionStatus(
  wikiAPIData?.production_status?.en_EN || 
  fyData?.basic?.productionStatus ||    // ✅ camelCase
  parsed.production_status
);
```

### Phase 5 : Ajouter Source StarCitizen-API.com (optionnel)

Tu as une clé API `STARCITIZEN_API_KEY` configurée. On peut l'utiliser comme fallback :

**Endpoints StarCitizen-API.com** :
- `https://api.starcitizen-api.com/v1/auto/ships` → liste de tous les vaisseaux
- `https://api.starcitizen-api.com/v1/auto/ships/{name}` → détails d'un vaisseau

**Avantages** :
- Production status fiable
- Données RSI officielles
- Composants parfois plus à jour

**Inconvénient** :
- Limité en requêtes (rate limiting)

### Phase 6 : Améliorer l'UI Admin (ShipDataComparison)

**Modifications** :
1. Afficher les slots hardpoints par catégorie
2. Montrer les composants installés quand disponibles
3. Ajouter un indicateur de complétude des données

---

## Fichiers à Modifier

### 1. `supabase/functions/ships-sync/index.ts`
- Ajouter appel à `/hardpoints` endpoint
- Corriger lecture `productionStatus` (camelCase)
- Améliorer `mapFleetYardsHardpoints()` pour gérer la nouvelle structure
- Stocker les slots ET les composants installés

### 2. `src/pages/ShipDetail.tsx`
- Refactorer l'affichage des systèmes/armement
- Afficher "2x S4 (Nom du composant)" au lieu de juste le nom

### 3. `src/components/ShipDataComparison.tsx`
- Améliorer l'affichage des composants dans l'admin
- Ajouter compteur de slots par catégorie

### 4. Nouvelles colonnes DB (optionnel)
- `hardpoint_slots` JSONB pour stocker la structure enrichie

---

## Résultats Attendus

| Métrique | Avant | Après |
|----------|-------|-------|
| Ships avec production_status | 128/261 (49%) | ~250/261 (95%+) |
| Ships avec composants/slots | 0/261 (0%) | ~230/261 (88%+) |
| Ships avec composants installés | 0/261 (0%) | ~100/261 (38%)* |
| Affichage slots dans UI | Non | Oui |

*Note: Les composants installés (loadouts) ne sont pas toujours fournis par FleetYards

---

## Ordre d'Exécution

1. **Corriger `fetchFleetYardsShipData()`** : Ajouter appel `/hardpoints`
2. **Corriger `mapFleetYardsHardpoints()`** : Nouveau mapping basé sur les types réels
3. **Corriger lecture `productionStatus`** : camelCase
4. **Modifier structure stockage** : Slots + composants
5. **Améliorer UI ShipDetail** : Afficher slots formatés
6. **Tester et déployer**
7. **Lancer sync complète** pour valider
