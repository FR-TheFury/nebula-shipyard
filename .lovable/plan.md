
# Plan de Correction - Système de Synchronisation des Vaisseaux

## Résumé du Diagnostic

Après analyse approfondie du code et des données, j'ai identifié les problèmes suivants :

### Problèmes Identifiés

1. **La synchronisation ships-sync est trop lente** : Elle traite 261 vaisseaux avec de multiples appels API (Wiki + FleetYards enriched data) et timeout après ~1 heure avant de terminer

2. **Les données existantes sont anciennes** : Dernière mise à jour le 28 octobre 2025 (il y a 3 mois)

3. **Le new-ships-sync ne crée plus de news "New Ships"** : Le RSS de RSI ne contient actuellement pas d'annonces correspondant aux mots-clés (0 news catégorie "New Ships" dans la DB)

4. **Performance critique** : Chaque vaisseau nécessite ~8 appels API (Wiki data + parsed HTML + FleetYards 7 endpoints), ce qui prend ~3-5 secondes par vaisseau = ~20 minutes minimum pour 261 vaisseaux

### État Actuel des Données
- **246 vaisseaux** dans la base de données
- **243** avec images
- **243** avec manufacturer  
- **168** avec rôle
- La sync actuelle est en cours (34/261 au moment du diagnostic)

---

## Plan de Correction

### Phase 1 : Optimisation Critique de ships-sync

**Fichier** : `supabase/functions/ships-sync/index.ts`

**Modifications** :
1. **Réduire les appels API enrichis** : Ne récupérer les données FleetYards enrichies (images, videos, loaners, etc.) que si le vaisseau n'a pas déjà ces données en cache
2. **Paralléliser les requêtes** : Traiter les vaisseaux par lots de 5 au lieu de 1 par 1
3. **Ajouter un mode "quick"** : Nouveau paramètre pour ne faire que les mises à jour essentielles (nom, manufacturer, role, size, image)
4. **Timeouts plus agressifs** : Réduire les timeouts individuels à 10s par endpoint
5. **Skip des vaisseaux sans changements** : Vérifier le hash avant de faire les appels FleetYards

```text
Changements clés :
┌─────────────────────────────────────────────────────────────┐
│ AVANT : 1 vaisseau = 8 appels API séquentiels (~5s)         │
│ APRÈS : 5 vaisseaux = appels parallélisés (~2s/vaisseau)    │
│                                                             │
│ AVANT : Toujours récupérer enriched data                    │
│ APRÈS : Skip si déjà en cache et pas forcé                  │
│                                                             │
│ AVANT : Timeout global 20 min                               │
│ APRÈS : Mode quick avec skip des données enrichies          │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2 : Amélioration du new-ships-sync

**Fichier** : `supabase/functions/new-ships-sync/index.ts`

**Modifications** :
1. **Élargir les mots-clés** : Ajouter plus de patterns pour détecter les annonces de vaisseaux
2. **Ajouter une source alternative** : Parser aussi la page "Ship Matrix" de RSI pour les vaisseaux récemment ajoutés
3. **Créer des news pour les vaisseaux récemment "Flight Ready"** : Utiliser le champ `flight_ready_since` de ships pour créer automatiquement des news

```text
Nouvelles sources de détection :
┌─────────────────────────────────────────────────────────────┐
│ 1. RSS RSI Comm-Link (existant, élargi)                     │
│ 2. Vaisseaux avec flight_ready_since récent (nouveau)       │
│ 3. Vaisseaux ajoutés récemment à la DB (nouveau)            │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3 : Interface d'affichage

**Fichiers** : `src/pages/Ships.tsx`, `src/components/ShipCard.tsx`

**Vérifications et ajustements** :
- S'assurer que tous les filtres fonctionnent
- Ajouter un badge "New" pour les vaisseaux récemment ajoutés
- Afficher la date de dernière mise à jour
- Gérer gracieusement les champs null

### Phase 4 : Nettoyage et Redémarrage

1. **Supprimer les locks bloquants**
2. **Annuler les syncs "running" zombies**  
3. **Lancer une sync initiale optimisée**
4. **Vérifier que le CRON fonctionne correctement**

---

## Détails Techniques

### Optimisation ships-sync - Batch Processing

```typescript
// Nouveau : traitement par lots
const BATCH_SIZE = 5;
const batches = [];
for (let i = 0; i < shipTitles.length; i += BATCH_SIZE) {
  batches.push(shipTitles.slice(i, i + BATCH_SIZE));
}

for (const batch of batches) {
  await Promise.allSettled(batch.map(title => processShip(title)));
}
```

### Optimisation ships-sync - Skip Cache

```typescript
// Nouveau : vérifier si enriched data existe déjà
const { data: existingShip } = await supabase
  .from('ships')
  .select('fleetyards_images, fleetyards_full_data, updated_at')
  .eq('slug', slug)
  .maybeSingle();

// Skip si données enrichies récentes (<7 jours) et pas forcé
const hasRecentEnrichedData = existingShip?.fleetyards_full_data && 
  new Date(existingShip.updated_at) > new Date(Date.now() - 7*24*60*60*1000);

if (!force && hasRecentEnrichedData) {
  console.log(`Skip enriched data for ${slug} - recent cache exists`);
  enrichedData = null; // Utiliser les données existantes
}
```

### new-ships-sync - Détection Améliorée

```typescript
// Nouveau : détecter les vaisseaux récemment flight ready
const { data: newFlightReady } = await supabase
  .from('ships')
  .select('name, slug, manufacturer, image_url, flight_ready_since')
  .not('flight_ready_since', 'is', null)
  .gte('flight_ready_since', new Date(Date.now() - 30*24*60*60*1000).toISOString())
  .order('flight_ready_since', { ascending: false })
  .limit(5);

// Créer des news pour ces vaisseaux
for (const ship of newFlightReady) {
  // Créer une news "New Ship: [Ship Name] is now Flight Ready!"
}
```

---

## Ordre d'Exécution

1. **Modifier `ships-sync`** : Ajouter mode quick, batch processing, skip cache
2. **Modifier `new-ships-sync`** : Améliorer détection, ajouter source flight_ready
3. **Vérifier UI** : S'assurer que Ships.tsx affiche correctement les données
4. **Nettoyer DB** : Supprimer locks et syncs zombies
5. **Tester** : Lancer une sync manuelle pour valider
6. **Déployer** : Les edge functions seront auto-déployées

---

## Résultats Attendus

| Métrique | Avant | Après |
|----------|-------|-------|
| Temps sync complète | >1h (timeout) | ~15-20 min |
| Vaisseaux par seconde | 0.07 | 0.25 |
| News "New Ships" | 0 | 1-5 (selon activité RSI) |
| Données enrichies | Jamais mises à jour | Mise à jour hebdo |
