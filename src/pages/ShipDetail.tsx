import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  ExternalLink, Users, Package, Ruler, Gauge, DollarSign, ArrowLeft,
  Sword, Compass, Shield, Zap, Target, Rocket, Box, Settings,
  Cpu, Fuel, Radio, Wind, Battery, Snowflake, Wrench, Info
} from "lucide-react";
import { ShipViewer3D } from "@/components/ShipViewer3D";
import { useTranslation } from "react-i18next";
import { Tables } from "@/integrations/supabase/types";
import { ShipImageGallery } from "@/components/ShipImageGallery";
import { ShipVideos } from "@/components/ShipVideos";
import { ShipLoaners } from "@/components/ShipLoaners";
import { ShipVariants } from "@/components/ShipVariants";
import { ShipModules } from "@/components/ShipModules";
import { ShipTags } from "@/components/ShipTags";

type Ship = Tables<"ships">;

// ─── small helper to get systems/armament nested safely ─────────────────────
function getArr(obj: any, ...path: string[]): string[] {
  let cur = obj;
  for (const key of path) {
    if (!cur || typeof cur !== "object") return [];
    cur = cur[key];
  }
  return Array.isArray(cur) ? cur : [];
}

// ─── Component list renderer ─────────────────────────────────────────────────
function ComponentSection({
  title,
  icon: Icon,
  items,
}: {
  title: string;
  icon: React.ElementType;
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1">
        <Icon className="w-3 h-3" />
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground/80 pl-3 border-l border-border/40">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Role utilities ──────────────────────────────────────────────────────────
function getRoleIcon(role: string) {
  const r = role.toLowerCase();
  if (r.includes("combat") || r.includes("fighter") || r.includes("military")) return <Sword className="mr-1 h-3 w-3" />;
  if (r.includes("exploration") || r.includes("pathfinder")) return <Compass className="mr-1 h-3 w-3" />;
  if (r.includes("cargo") || r.includes("transport") || r.includes("hauling")) return <Package className="mr-1 h-3 w-3" />;
  if (r.includes("support") || r.includes("medical") || r.includes("repair")) return <Shield className="mr-1 h-3 w-3" />;
  if (r.includes("mining") || r.includes("industrial")) return <Target className="mr-1 h-3 w-3" />;
  if (r.includes("racing") || r.includes("competition")) return <Rocket className="mr-1 h-3 w-3" />;
  if (r.includes("passenger") || r.includes("touring")) return <Users className="mr-1 h-3 w-3" />;
  return <Zap className="mr-1 h-3 w-3" />;
}

function getRoleBadgeColor(role: string) {
  const r = role.toLowerCase();
  if (r.includes("combat") || r.includes("fighter") || r.includes("military")) return "bg-red-500/20 text-red-400 border-red-500/30";
  if (r.includes("exploration") || r.includes("pathfinder")) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (r.includes("cargo") || r.includes("transport") || r.includes("hauling")) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
  if (r.includes("support") || r.includes("medical") || r.includes("repair")) return "bg-green-500/20 text-green-400 border-green-500/30";
  if (r.includes("mining") || r.includes("industrial")) return "bg-orange-500/20 text-orange-400 border-orange-500/30";
  if (r.includes("racing") || r.includes("competition")) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
  return "bg-primary/20 text-primary border-primary/30";
}

function getStatusBadge(status: string | null) {
  if (!status) return null;
  const s = status.toLowerCase();
  if (s.includes("flight") || s.includes("in game")) return { label: "In Game", cls: "bg-green-500/20 text-green-400 border-green-500/30" };
  if (s.includes("concept")) return { label: "Concept", cls: "bg-blue-500/20 text-blue-400 border-blue-500/30" };
  if (s.includes("greybox") || s.includes("grey")) return { label: "Greybox", cls: "bg-gray-500/20 text-gray-400 border-gray-500/30" };
  if (s.includes("wip") || s.includes("work")) return { label: "WIP", cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" };
  return { label: status, cls: "bg-muted text-muted-foreground border-border" };
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function ShipDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  const { data: ship, isLoading } = useQuery({
    queryKey: ["ship", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ships")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw error;
      return data as Ship | null;
    },
    enabled: !!slug,
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-96 w-full" />
        <div className="grid md:grid-cols-2 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!ship) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <Link to="/ships">
          <Button variant="ghost" className="mb-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t("ships.backToList")}
          </Button>
        </Link>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t("ships.notFound")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const sys = ship.systems as any ?? {};
  const arm = ship.armament as any ?? {};
  const fy = ship.fleetyards_full_data as any;
  const statusBadge = getStatusBadge(ship.production_status);

  // Try to grab aUEC price from fleetyards_full_data or prices
  const prices = Array.isArray(ship.prices) ? ship.prices as any[] : [];
  const uecPrice = fy?.pledgePrice ?? fy?.pledge_price ?? null;

  // Build component sections from systems
  const avionicsItems = [
    ...getArr(sys, "avionics", "radar"),
    ...getArr(sys, "avionics", "computer"),
    ...getArr(sys, "avionics", "scanner"),
    ...getArr(sys, "avionics", "ping"),
  ];
  const propItems = [
    ...getArr(sys, "propulsion", "quantum_drives"),
    ...getArr(sys, "propulsion", "fuel_intakes"),
    ...getArr(sys, "propulsion", "fuel_tanks"),
    ...getArr(sys, "propulsion", "quantum_fuel_tanks"),
    ...getArr(sys, "propulsion", "jump_modules"),
  ];
  const thrusterItems = [
    ...getArr(sys, "thrusters", "main"),
    ...getArr(sys, "thrusters", "maneuvering"),
    ...getArr(sys, "thrusters", "retro"),
    ...getArr(sys, "thrusters", "vtol"),
  ];
  const powerItems = [
    ...getArr(sys, "power", "power_plants"),
    ...getArr(sys, "power", "coolers"),
    ...getArr(sys, "power", "shield_generators"),
  ];

  const weaponItems = getArr(arm, "weapons");
  const turretItems = getArr(arm, "turrets");
  const missileItems = getArr(arm, "missiles");
  const utilityItems = getArr(arm, "utility");
  const cmItems = getArr(arm, "countermeasures");

  const hasComponents = avionicsItems.length + propItems.length + thrusterItems.length + powerItems.length > 0;
  const hasArmament = weaponItems.length + turretItems.length + missileItems.length + utilityItems.length + cmItems.length > 0;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
      {/* Back button */}
      <Link to="/ships">
        <Button variant="ghost">
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t("ships.backToList")}
        </Button>
      </Link>

      {/* ─── Header ─────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-bold mb-1 text-primary">{ship.name}</h1>
          {ship.manufacturer && (
            <p className="text-xl text-muted-foreground mb-3">{ship.manufacturer}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {ship.role && (
              <Badge className={getRoleBadgeColor(ship.role)}>
                {getRoleIcon(ship.role)}
                {ship.role}
              </Badge>
            )}
            {ship.size && (
              <Badge variant="secondary" className="text-xs">
                <Box className="mr-1 h-3 w-3" />
                {ship.size}
              </Badge>
            )}
            {statusBadge && (
              <Badge className={`text-xs ${statusBadge.cls}`}>{statusBadge.label}</Badge>
            )}
            {ship.patch && (
              <Badge variant="outline" className="text-xs">{ship.patch}</Badge>
            )}
          </div>
        </div>
      </div>

      {/* ─── Image + Quick Stats ─────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {ship.model_glb_url ? (
              <div className="h-96">
                <ShipViewer3D modelUrl={ship.model_glb_url} shipName={ship.name} />
              </div>
            ) : ship.image_url ? (
              <img
                src={ship.image_url}
                alt={ship.name}
                className="w-full h-96 object-cover"
                onError={(e) => { e.currentTarget.src = "/placeholder.svg"; }}
              />
            ) : (
              <div className="w-full h-96 bg-muted flex items-center justify-center">
                <Package className="h-24 w-24 text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("ships.technicalSpecs")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Stat icon={Users} label={t("ships.crew")}>
                {ship.crew_min != null && ship.crew_max != null
                  ? ship.crew_min === ship.crew_max
                    ? String(ship.crew_min)
                    : `${ship.crew_min}–${ship.crew_max}`
                  : "N/A"}
              </Stat>
              <Stat icon={Package} label={t("ships.cargo")}>
                {ship.cargo_scu ? `${ship.cargo_scu} SCU` : "N/A"}
              </Stat>
              <Stat icon={Gauge} label={`SCM ${t("ships.speed")}`}>
                {ship.scm_speed ? `${ship.scm_speed} m/s` : "N/A"}
              </Stat>
              <Stat icon={Zap} label={`Max ${t("ships.speed")}`}>
                {ship.max_speed ? `${ship.max_speed} m/s` : "N/A"}
              </Stat>
              <Stat icon={Ruler} label={t("ships.length")}>
                {ship.length_m ? `${ship.length_m} m` : "N/A"}
              </Stat>
              <Stat icon={Ruler} label={t("ships.beam")}>
                {ship.beam_m ? `${ship.beam_m} m` : "N/A"}
              </Stat>
              <Stat icon={Ruler} label={t("ships.height")}>
                {ship.height_m ? `${ship.height_m} m` : "N/A"}
              </Stat>
              {uecPrice && (
                <Stat icon={DollarSign} label="Pledge Price">
                  ${Number(uecPrice).toLocaleString()}
                </Stat>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Systems / Components ─────────────────────────────────────── */}
      {hasComponents ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {avionicsItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Radio className="h-4 w-4 text-primary" /> Avionics
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {avionicsItems.map((item, i) => <div key={i} className="border-l-2 border-primary/30 pl-2">{item}</div>)}
              </CardContent>
            </Card>
          )}
          {propItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Fuel className="h-4 w-4 text-blue-400" /> {t("ships.propulsion")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {propItems.map((item, i) => <div key={i} className="border-l-2 border-blue-400/30 pl-2">{item}</div>)}
              </CardContent>
            </Card>
          )}
          {thrusterItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wind className="h-4 w-4 text-cyan-400" /> {t("ships.thrusters")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {thrusterItems.map((item, i) => <div key={i} className="border-l-2 border-cyan-400/30 pl-2">{item}</div>)}
              </CardContent>
            </Card>
          )}
          {powerItems.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Battery className="h-4 w-4 text-yellow-400" /> {t("ships.powerSystems")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-muted-foreground">
                {powerItems.map((item, i) => <div key={i} className="border-l-2 border-yellow-400/30 pl-2">{item}</div>)}
              </CardContent>
            </Card>
          )}
        </div>
      ) : (
        <Card className="border-dashed border-muted">
          <CardContent className="py-8 flex items-center gap-3 text-muted-foreground">
            <Info className="h-5 w-5 shrink-0" />
            <p className="text-sm">
              Les données composants ne sont pas encore disponibles pour ce vaisseau.
              Lancez la synchronisation FleetYards depuis l'admin pour les récupérer.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ─── Armament ─────────────────────────────────────────────────── */}
      {hasArmament ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              {t("ships.weaponry")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
              {weaponItems.length > 0 && (
                <ComponentSection title={t("ships.weapons")} icon={Sword} items={weaponItems} />
              )}
              {turretItems.length > 0 && (
                <ComponentSection title={t("ships.turrets")} icon={Settings} items={turretItems} />
              )}
              {missileItems.length > 0 && (
                <ComponentSection title={t("ships.missiles")} icon={Rocket} items={missileItems} />
              )}
              {utilityItems.length > 0 && (
                <ComponentSection title={t("ships.utilityItems")} icon={Wrench} items={utilityItems} />
              )}
              {cmItems.length > 0 && (
                <ComponentSection title="Countermeasures" icon={Shield} items={cmItems} />
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-dashed border-muted">
          <CardContent className="py-8 flex items-center gap-3 text-muted-foreground">
            <Info className="h-5 w-5 shrink-0" />
            <p className="text-sm">{t("ships.noArmamentData")}</p>
          </CardContent>
        </Card>
      )}

      {/* ─── Pricing ──────────────────────────────────────────────────── */}
      {prices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              {t("ships.pricing")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {prices.map((price: any, i: number) => (
                <div key={i} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{price.type || "Price"}</p>
                  <p className="text-lg font-semibold">
                    {price.amount ? `$${Number(price.amount).toLocaleString()}` : "N/A"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── External Links ────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>{t("ships.externalLinks")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <a
            href={`https://starcitizen.tools/${ship.name.replace(/ /g, "_")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-3 w-3" /> Star Citizen Wiki
            </Button>
          </a>
          <a
            href={`https://www.erkul.games/live/calculator?ship=${ship.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="h-3 w-3" /> Erkul DPS Calculator
            </Button>
          </a>
          {fy?.storeUrl && (
            <a href={fy.storeUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-2">
                <ExternalLink className="h-3 w-3" /> RSI Store
              </Button>
            </a>
          )}
        </CardContent>
      </Card>

      {/* ─── FleetYards enriched sections ──────────────────────────────── */}
      <ShipTags fullData={fy} />
      <ShipImageGallery images={(ship as any).fleetyards_images} />
      <ShipVideos videos={(ship as any).fleetyards_videos} />
      <ShipLoaners loaners={(ship as any).fleetyards_loaners} />
      <ShipVariants variants={(ship as any).fleetyards_variants} />
      <ShipModules modules={(ship as any).fleetyards_modules} />
    </div>
  );
}

// ─── Tiny stat card row ───────────────────────────────────────────────────────
function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ElementType;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center text-muted-foreground text-xs">
        <Icon className="mr-1 h-3 w-3" />
        {label}
      </div>
      <p className="font-semibold">{children}</p>
    </div>
  );
}
