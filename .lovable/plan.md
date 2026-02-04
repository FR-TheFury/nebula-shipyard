
# Plan d'Amélioration - Correction des Prix et Système de Data Mining

## Partie 1 : Correction des Prix

### Problème Identifié
Le code actuel (ligne 916-917) utilise le mauvais champ pour les prix :

```typescript
// ACTUEL (INCORRECT)
} else if (fyData?.basic?.price && fyData.basic.price > 0) {
  finalPrices = [{ amount: fyData.basic.price, currency: 'USD' }];
}
```

Le champ `price` contient le prix en aUEC (monnaie en-jeu), pas le prix USD.

### Solution
Utiliser `pledgePrice` qui contient le vrai prix en USD :

```text
400i FleetYards Response:
├── price: 6,352,700      → Prix en-jeu (aUEC) ❌
├── priceLabel: "6352700 aUEC"
├── pledgePrice: 250      → Prix réel (USD) ✅
└── pledgePriceLabel: "$250"
```

### Modification Requise

**Fichier** : `supabase/functions/ships-sync/index.ts`

```typescript
// CORRIGÉ
} else if (fyData?.basic?.pledgePrice && fyData.basic.pledgePrice > 0) {
  finalPrices = [{ amount: fyData.basic.pledgePrice, currency: 'USD' }];
}
```

### Structure de Prix Enrichie
Stocker les deux prix pour plus d'infos :

```typescript
prices: [
  { amount: pledgePrice, currency: 'USD', type: 'pledge' },
  { amount: price, currency: 'aUEC', type: 'ingame' }
]
```

---

## Partie 2 : Système de Data Mining pour Vaisseaux Non-Annoncés

### Sources Disponibles

| Source | Type de Données | Automatisable |
|--------|-----------------|---------------|
| RSI Monthly Reports | Mentions textuelles (whitebox, greybox) | Oui (Comm-Links API) |
| Spaceloop.it | Datamining des fichiers P4K | Scraping |
| SCUnpacked GitHub | Données extraites JSON | Oui (API GitHub) |
| FleetYards Roadmap | Vaisseaux en développement | Oui (API) |
| Star Citizen Wiki API | Véhicules avec statuts | Oui (API) |

### Architecture Proposée

```text
┌─────────────────────────────────────────────────────────────────┐
│                   SYSTÈME DE VEILLE SHIPS                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│  │ RSI Comm-    │    │ SCUnpacked   │    │ FleetYards   │      │
│  │ Links API    │    │ GitHub Raw   │    │ Roadmap API  │      │
│  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘      │
│         │                   │                   │               │
│         ▼                   ▼                   ▼               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Edge Function: unannounced-ships-sync        │  │
│  │  • Parse Monthly Reports (regex "unannounced vehicle")    │  │
│  │  • Fetch SCUnpacked ship manifests                        │  │
│  │  • Compare with existing ships table                      │  │
│  │  • Generate "rumors" / "leaked" entries                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                            │                                    │
│                            ▼                                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │                Table: ship_rumors                         │  │
│  │  • codename (ex: "Unannounced Vehicle #1")                │  │
│  │  • possible_manufacturer                                  │  │
│  │  • development_stage (whitebox, greybox, final)           │  │
│  │  • source (monthly_report, datamine, leak)                │  │
│  │  • first_mentioned_date                                   │  │
│  │  • last_updated                                           │  │
│  │  • evidence (array of sources/links)                      │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Nouvelle Table : ship_rumors

```sql
CREATE TABLE ship_rumors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codename TEXT NOT NULL,
  possible_name TEXT,
  possible_manufacturer TEXT,
  development_stage TEXT, -- 'whitebox', 'greybox', 'final_review', 'concepting'
  ship_type TEXT, -- 'fighter', 'cargo', 'exploration', etc.
  estimated_size TEXT, -- 'small', 'medium', 'large', 'capital'
  source_type TEXT NOT NULL, -- 'monthly_report', 'datamine', 'leak', 'roadmap'
  source_url TEXT,
  source_date TIMESTAMPTZ,
  first_mentioned TIMESTAMPTZ DEFAULT NOW(),
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  evidence JSONB, -- [{source: 'url', date: '', excerpt: ''}]
  confirmed_ship_id UUID REFERENCES ships(id), -- Link when ship is announced
  is_active BOOLEAN DEFAULT true,
  notes TEXT
);
```

### Edge Function : unannounced-ships-sync

```typescript
// Sources à scraper/parser
const sources = {
  // 1. RSI Monthly Reports (Comm-Links API)
  monthlyReports: 'https://robertsspaceindustries.com/api/hub/getCommlinkItems',
  
  // 2. SCUnpacked (données extraites des fichiers)
  scUnpacked: 'https://raw.githubusercontent.com/StarCitizenWiki/scunpacked/main/api/ships.json',
  
  // 3. FleetYards models avec productionStatus
  fleetyards: 'https://api.fleetyards.net/v1/models?productionStatus=in-concept'
};

// Patterns à rechercher dans les Monthly Reports
const patterns = [
  /unannounced vehicle/gi,
  /whitebox review/gi,
  /greybox review/gi,
  /concepting variants/gi,
  /new ship in early concept/gi
];
```

### Affichage UI

Créer une nouvelle page ou section dans l'Admin :

```text
┌────────────────────────────────────────────────────────────────┐
│ 🔍 Vaisseaux Non-Annoncés / En Développement                   │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│ [Filtres] Whitebox │ Greybox │ Final Review │ Toutes sources  │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ 🚀 Unannounced Vehicle #1                                  │ │
│ │ Stage: Final Review ████████████░░ 85%                     │ │
│ │ Source: Monthly Report January 2026                        │ │
│ │ "First unannounced vehicle is in final review..."          │ │
│ │ Dernière mise à jour: il y a 2 jours                       │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ 🚀 Unannounced Vehicle #2                                  │ │
│ │ Stage: Early Concept ██░░░░░░░░░░░ 15%                     │ │
│ │ Source: Monthly Report January 2026                        │ │
│ │ "Second unannounced vehicle in early concept..."           │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ 🚀 Gatac Railen                    [✓ Confirmé]            │ │
│ │ Stage: Whitebox Review ████░░░░░░░░ 35%                    │ │
│ │ Manufacturer: Gatac                                        │ │
│ │ Source: Monthly Report January 2026                        │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

## Fichiers à Modifier/Créer

### 1. Correction des Prix
**Fichier** : `supabase/functions/ships-sync/index.ts`
- Remplacer `fyData.basic.price` par `fyData.basic.pledgePrice`
- Ajouter logique pour stocker les deux types de prix

### 2. Nouvelle Edge Function
**Fichier** : `supabase/functions/unannounced-ships-sync/index.ts`
- Parser les Monthly Reports RSI
- Extraire les mentions de vaisseaux non-annoncés
- Comparer avec SCUnpacked et FleetYards
- Stocker dans nouvelle table ship_rumors

### 3. Migration DB
**Fichier** : `supabase/migrations/XXXXXX_create_ship_rumors.sql`
- Créer la table ship_rumors
- Ajouter index sur source_type et development_stage

### 4. UI Admin
**Fichier** : `src/pages/Admin.tsx`
- Ajouter onglet "Vaisseaux Non-Annoncés"
- Afficher les rumors avec leur stade de développement

### 5. Composant Rumors
**Fichier** : `src/components/ShipRumorsTracker.tsx`
- Afficher la liste des vaisseaux en développement
- Indicateur de progression (whitebox → greybox → final)
- Lien vers les sources

---

## Ordre d'Exécution

1. **Corriger les prix** (priorité haute)
   - Modifier ships-sync pour utiliser `pledgePrice`
   - Tester sur quelques vaisseaux
   - Lancer sync complète

2. **Créer table ship_rumors**
   - Migration SQL
   - Tester structure

3. **Créer edge function unannounced-ships-sync**
   - Parser RSI Monthly Reports
   - Intégrer SCUnpacked

4. **Créer UI de visualisation**
   - Page/onglet admin
   - Composant ShipRumorsTracker

5. **Tester et déployer**

---

## Résultats Attendus

| Amélioration | Avant | Après |
|--------------|-------|-------|
| Prix corrects (USD) | ~10 ships | 100% des ships |
| Vaisseaux non-annoncés trackés | 0 | ~10-15 rumors |
| Sources de données | 2 | 4+ (RSI, FY, SCUnpacked, Spaceloop) |
| Suivi développement | Non | Oui (whitebox→final) |
