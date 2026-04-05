

# Plan: Systeme de Donnees Complet - UEX + SCUnpacked

## Vue d'ensemble

Ajouter 4 nouveaux modules de donnees en combinant UEX API 2.0 (prix dynamiques, locations, commodites) et SCUnpacked Data (specs brutes extraites des fichiers du jeu). Cela necessite un token UEX API, de nouvelles tables DB, de nouvelles edge functions de sync, et 4 nouvelles pages frontend.

## Architecture des Sources

```text
SCUnpacked (GitHub raw JSON)          UEX API 2.0
  - ships.json (specs brutes)          - commodities (prix buy/sell)
  - ship-items.json (composants)       - commodities_prices (par terminal)
  - items.json (armes, armures...)     - items / items_prices
  - shops.json (magasins)              - refineries_methods / yields
                                       - terminals (lieux de vente)
                                       - vehicles_purchases_prices (aUEC)
                                       - star_systems / planets / moons
```

## Etape 1 : Configuration UEX API

- Demander a l'utilisateur son token UEX (gratuit sur uexcorp.space/api/apps)
- Stocker comme secret Supabase `UEX_API_KEY`
- SCUnpacked = pas de cle, donnees publiques sur GitHub raw

## Etape 2 : Nouvelles Tables DB

**`commodities`** : id, name, slug, code, category (gas, metal, mineral, agricultural...), is_raw, is_illegal, is_harvestable, buy_price_avg, sell_price_avg, updated_at

**`commodity_prices`** : id, commodity_id (FK), terminal_id (FK), price_buy, price_sell, scu_buy, scu_sell, status (out_of_stock, low, normal, high), updated_at

**`terminals`** : id, name, slug, type (commodity, refinery, shop...), location_type (space_station, outpost, city...), star_system, planet, moon, space_station, latitude, longitude, is_refinery, updated_at

**`missions`** : id, title, description, category (delivery, bounty, mercenary, salvage, mining, maintenance...), mission_type, faction, star_system, reward_auec, base_xp, is_illegal, is_shareable, is_unique, is_repeatable, is_chain, chain_length, rank_required, combat_threat, blueprint_reward, updated_at

**`mining_resources`** : id, commodity_id (FK), location_type (asteroid, surface, subsurface), star_system, planet, moon, concentration_pct, rarity, updated_at

**`refinery_methods`** : id, name, duration_modifier, cost_modifier, yield_modifier, updated_at

**`refinery_yields`** : id, commodity_id (FK), method_id (FK), terminal_id (FK), yield_pct, duration_seconds, cost_auec, updated_at

**`game_items`** : id, name, slug, category (weapon, armor, component, food...), sub_category, manufacturer, size, grade, buy_price_avg, sell_price_avg, uuid, updated_at

## Etape 3 : Edge Functions de Sync

### `commodities-sync`
- Fetch UEX `/commodities` pour la liste + metadata
- Fetch UEX `/commodities_prices_all` pour les prix par terminal
- Fetch UEX `/terminals` pour les lieux
- Upsert dans `commodities`, `commodity_prices`, `terminals`
- CRON toutes les 12h

### `missions-sync`
- Source primaire : SCUnpacked `shops.json` + mission data files
- Source secondaire : scraping des donnees de missions connues
- Upsert dans `missions`
- Note : les missions ne sont pas disponibles via UEX API directement. On utilisera les donnees SCUnpacked et possiblement un scrape de scmdb.net ou un fichier JSON communautaire
- CRON toutes les 24h (change peu souvent)

### `mining-sync`
- Fetch UEX `/commodities` (filtre is_raw/harvestable)
- Fetch UEX `/refineries_methods`, `/refineries_yields`, `/refineries_capacities`
- Cross-reference avec les locations de minage
- Upsert dans `mining_resources`, `refinery_methods`, `refinery_yields`
- CRON toutes les 24h

### `items-sync`
- Fetch UEX `/items` pour la liste complete
- Fetch UEX `/items_prices_all` pour les prix par lieu
- Upsert dans `game_items`
- CRON toutes les 24h

### Amelioration `ships-sync`
- Ajouter fetch UEX `/vehicles_purchases_prices` pour les prix in-game en aUEC
- Fetch SCUnpacked `ships.json` pour les specs brutes extraites des fichiers du jeu
- Stocker les prix aUEC dans le champ `prices` existant

## Etape 4 : Nouvelles Pages Frontend

### `/commodities` - Ressources & Commodites
- Tableau filtrable avec colonnes : Nom, Categorie, Prix Achat moy, Prix Vente moy, Meilleur lieu d'achat, Meilleur lieu de vente, Profit/SCU
- Filtres : categorie, systeme stellaire, legal/illegal, harvestable
- Detail d'une commodite : graphique de prix, liste de tous les terminaux avec prix
- Routes commerciales optimales (calcul profit par SCU entre terminaux)

### `/missions` - Base de Missions
- Layout type SCMDB : tiles ou table view
- Filtres : categorie, faction, systeme stellaire, legalite, sharable/solo, reward min/max, rank required, blueprint
- Tags colores comme SCMDB (type, systeme, illegal, chain, etc.)
- Detail mission avec description, requirements, rewards

### `/mining` - Guide Mining & Raffinage
- Liste des ressources minables avec lieux, concentration, rarete
- Raffineries : localisation, methodes disponibles, rendements, durees, couts
- Calculateur de profit mining (ressource -> methode raffinage -> vente)
- Carte des lieux de minage par systeme/planete

### `/items` - Base d'Objets
- Catalogue filtrable : armes FPS, composants vaisseau, armures, consommables
- Filtres : categorie, fabricant, taille, grade, prix
- Detail item avec specs et lieux d'achat

### Navigation
- Ajouter les 4 nouvelles pages dans le menu principal
- Grouper sous un menu "Database" ou "Guides"

## Etape 5 : Amelioration Ships existants
- Afficher prix in-game aUEC sur la page ShipDetail
- Ajouter lien vers les composants dans la base d'items
- Cross-reference loaners avec la page ships

## Ordre d'execution

| Phase | Tache | Estimation |
|-------|-------|------------|
| 1 | Config UEX API key + tables DB | 1 message |
| 2 | Edge function `commodities-sync` + page `/commodities` | 2-3 messages |
| 3 | Edge function `mining-sync` + page `/mining` | 2-3 messages |
| 4 | Edge function `missions-sync` + page `/missions` | 2-3 messages |
| 5 | Edge function `items-sync` + page `/items` | 2-3 messages |
| 6 | Amelioration ships-sync (prix aUEC) | 1 message |
| 7 | Navigation + polish | 1 message |

## Pre-requis

- **Token UEX API** : gratuit, a creer sur https://uexcorp.space/api/apps
- Le token sera stocke comme secret Supabase pour les edge functions

