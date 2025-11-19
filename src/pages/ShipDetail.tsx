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
  Cpu, Fuel, Radio, Wind, Battery, Snowflake, Wrench
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

function ShipDetail() {
  const { slug } = useParams<{ slug: string }>();
  const { t } = useTranslation();

  const { data: ship, isLoading } = useQuery({
    queryKey: ["ship", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ships")
        .select("*")
        .eq("slug", slug)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
  });

  const getRoleIcon = (role: string) => {
    const roleLower = role.toLowerCase();
    if (roleLower.includes("combat") || roleLower.includes("fighter") || roleLower.includes("military")) {
      return <Sword className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("exploration") || roleLower.includes("pathfinder")) {
      return <Compass className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("cargo") || roleLower.includes("transport") || roleLower.includes("hauling")) {
      return <Package className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("support") || roleLower.includes("medical") || roleLower.includes("repair")) {
      return <Shield className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("multi") || roleLower.includes("versatile")) {
      return <Zap className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("mining") || roleLower.includes("industrial")) {
      return <Target className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("racing") || roleLower.includes("competition")) {
      return <Rocket className="mr-1 h-3 w-3" />;
    }
    if (roleLower.includes("passenger") || roleLower.includes("touring")) {
      return <Users className="mr-1 h-3 w-3" />;
    }
    return <Zap className="mr-1 h-3 w-3" />;
  };

  const getRoleBadgeColor = (role: string) => {
    const roleLower = role.toLowerCase();
    if (roleLower.includes("combat") || roleLower.includes("fighter") || roleLower.includes("military")) {
      return "bg-red-500/20 text-red-500 border-red-500/30";
    }
    if (roleLower.includes("exploration") || roleLower.includes("pathfinder")) {
      return "bg-blue-500/20 text-blue-500 border-blue-500/30";
    }
    if (roleLower.includes("cargo") || roleLower.includes("transport") || roleLower.includes("hauling")) {
      return "bg-yellow-500/20 text-yellow-500 border-yellow-500/30";
    }
    if (roleLower.includes("support") || roleLower.includes("medical") || roleLower.includes("repair")) {
      return "bg-green-500/20 text-green-500 border-green-500/30";
    }
    if (roleLower.includes("mining") || roleLower.includes("industrial")) {
      return "bg-orange-500/20 text-orange-500 border-orange-500/30";
    }
    if (roleLower.includes("racing") || roleLower.includes("competition")) {
      return "bg-purple-500/20 text-purple-500 border-purple-500/30";
    }
    return "bg-primary/20 text-primary border-primary/30";
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="space-y-6">
          <Skeleton className="h-12 w-64" />
          <Skeleton className="h-96 w-full" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  if (!ship) {
    return (
      <div className="container mx-auto px-4 py-6 max-w-7xl">
        <div className="space-y-6">
          <Link to="/ships">
            <Button variant="ghost">
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
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl space-y-6">
          {/* Ship Header */}
          <div className="mb-8">
            <Link to="/ships">
              <Button variant="ghost" className="mb-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t("ships.backToList")}
              </Button>
            </Link>
            
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-4xl font-bold mb-2 text-primary">{ship.name}</h1>
                {ship.manufacturer && (
                  <p className="text-xl text-muted-foreground mb-4">{ship.manufacturer}</p>
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
                  {ship.patch && (
                    <Badge variant="outline" className="text-xs bg-accent/50">
                      {ship.patch}
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Ship Image or 3D Model */}
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
                    onError={(e) => {
                      e.currentTarget.src = "/placeholder.svg";
                    }}
                  />
                ) : (
                  <div className="w-full h-96 bg-muted flex items-center justify-center">
                    <Package className="h-24 w-24 text-muted-foreground" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle>{t("ships.technicalSpecs")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center text-muted-foreground text-sm">
                      <Users className="mr-2 h-4 w-4" />
                      {t("ships.crew")}
                    </div>
                    <p className="text-lg font-semibold">
                      {ship.crew_min && ship.crew_max
                        ? ship.crew_min === ship.crew_max
                          ? ship.crew_min
                          : `${ship.crew_min}-${ship.crew_max}`
                        : "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-muted-foreground text-sm">
                      <Package className="mr-2 h-4 w-4" />
                      {t("ships.cargo")}
                    </div>
                    <p className="text-lg font-semibold">
                      {ship.cargo_scu ? `${ship.cargo_scu} SCU` : "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-muted-foreground text-sm">
                      <Gauge className="mr-2 h-4 w-4" />
                      SCM {t("ships.speed")}
                    </div>
                    <p className="text-lg font-semibold">
                      {ship.scm_speed ? `${ship.scm_speed} m/s` : "N/A"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center text-muted-foreground text-sm">
                      <Zap className="mr-2 h-4 w-4" />
                      Max {t("ships.speed")}
                    </div>
                    <p className="text-lg font-semibold">
                      {ship.max_speed ? `${ship.max_speed} m/s` : "N/A"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detailed Specifications Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
            {/* Dimensions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Ruler className="mr-2 h-5 w-5" />
                  {t("ships.dimensions")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ships.length")}</span>
                  <span className="font-semibold">{ship.length_m ? `${ship.length_m} m` : "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ships.beam")}</span>
                  <span className="font-semibold">{ship.beam_m ? `${ship.beam_m} m` : "N/A"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("ships.height")}</span>
                  <span className="font-semibold">{ship.height_m ? `${ship.height_m} m` : "N/A"}</span>
                </div>
              </CardContent>
            </Card>

            {/* Avionics */}
            {ship.systems && typeof ship.systems === "object" && "avionics" in ship.systems && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Radio className="mr-2 h-5 w-5" />
                    {t("ships.avionics")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.isArray((ship.systems as any).avionics?.radar) && (ship.systems as any).avionics.radar.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Radar</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).avionics.radar.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).avionics?.computer) && (ship.systems as any).avionics.computer.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Computer</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).avionics.computer.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).avionics?.ping) && (ship.systems as any).avionics.ping.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Ping</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).avionics.ping.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).avionics?.scanner) && (ship.systems as any).avionics.scanner.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Scanner</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).avionics.scanner.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(Array.isArray((ship.systems as any).avionics?.radar) && (ship.systems as any).avionics.radar.length > 0) &&
                   !(Array.isArray((ship.systems as any).avionics?.computer) && (ship.systems as any).avionics.computer.length > 0) &&
                   !(Array.isArray((ship.systems as any).avionics?.ping) && (ship.systems as any).avionics.ping.length > 0) &&
                   !(Array.isArray((ship.systems as any).avionics?.scanner) && (ship.systems as any).avionics.scanner.length > 0) && (
                    <p className="text-muted-foreground text-sm">N/A</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Propulsion */}
            {ship.systems && typeof ship.systems === "object" && "propulsion" in ship.systems && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Fuel className="mr-2 h-5 w-5" />
                    {t("ships.propulsion")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.isArray((ship.systems as any).propulsion?.fuel_intakes) && (ship.systems as any).propulsion.fuel_intakes.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Fuel Intakes</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).propulsion.fuel_intakes.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).propulsion?.fuel_tanks) && (ship.systems as any).propulsion.fuel_tanks.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Fuel Tanks</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).propulsion.fuel_tanks.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).propulsion?.quantum_drives) && (ship.systems as any).propulsion.quantum_drives.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Quantum Drives</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).propulsion.quantum_drives.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).propulsion?.quantum_fuel_tanks) && (ship.systems as any).propulsion.quantum_fuel_tanks.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Quantum Fuel Tanks</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).propulsion.quantum_fuel_tanks.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).propulsion?.jump_modules) && (ship.systems as any).propulsion.jump_modules.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Jump Modules</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).propulsion.jump_modules.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(Array.isArray((ship.systems as any).propulsion?.fuel_intakes) && (ship.systems as any).propulsion.fuel_intakes.length > 0) &&
                   !(Array.isArray((ship.systems as any).propulsion?.fuel_tanks) && (ship.systems as any).propulsion.fuel_tanks.length > 0) &&
                   !(Array.isArray((ship.systems as any).propulsion?.quantum_drives) && (ship.systems as any).propulsion.quantum_drives.length > 0) &&
                   !(Array.isArray((ship.systems as any).propulsion?.quantum_fuel_tanks) && (ship.systems as any).propulsion.quantum_fuel_tanks.length > 0) &&
                   !(Array.isArray((ship.systems as any).propulsion?.jump_modules) && (ship.systems as any).propulsion.jump_modules.length > 0) && (
                    <p className="text-muted-foreground text-sm">N/A</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Thrusters */}
            {ship.systems && typeof ship.systems === "object" && "thrusters" in ship.systems && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Wind className="mr-2 h-5 w-5" />
                    {t("ships.thrusters")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.isArray((ship.systems as any).thrusters?.main) && (ship.systems as any).thrusters.main.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Main</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).thrusters.main.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).thrusters?.maneuvering) && (ship.systems as any).thrusters.maneuvering.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Maneuvering</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).thrusters.maneuvering.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).thrusters?.retro) && (ship.systems as any).thrusters.retro.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Retro</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).thrusters.retro.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(Array.isArray((ship.systems as any).thrusters?.main) && (ship.systems as any).thrusters.main.length > 0) &&
                   !(Array.isArray((ship.systems as any).thrusters?.maneuvering) && (ship.systems as any).thrusters.maneuvering.length > 0) &&
                   !(Array.isArray((ship.systems as any).thrusters?.retro) && (ship.systems as any).thrusters.retro.length > 0) && (
                    <p className="text-muted-foreground text-sm">N/A</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Power Systems */}
            {ship.systems && typeof ship.systems === "object" && "power" in ship.systems && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Battery className="mr-2 h-5 w-5" />
                    {t("ships.powerSystems")}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.isArray((ship.systems as any).power?.power_plants) && (ship.systems as any).power.power_plants.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Power Plants</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).power.power_plants.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).power?.coolers) && (ship.systems as any).power.coolers.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Coolers</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).power.coolers.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).power?.shield_generators) && (ship.systems as any).power.shield_generators.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Shield Generators</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).power.shield_generators.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(Array.isArray((ship.systems as any).power?.power_plants) && (ship.systems as any).power.power_plants.length > 0) &&
                   !(Array.isArray((ship.systems as any).power?.coolers) && (ship.systems as any).power.coolers.length > 0) &&
                   !(Array.isArray((ship.systems as any).power?.shield_generators) && (ship.systems as any).power.shield_generators.length > 0) && (
                    <p className="text-muted-foreground text-sm">N/A</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Modular Systems */}
            {ship.systems && typeof ship.systems === "object" && "modular" in ship.systems && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Settings className="mr-2 h-5 w-5" />
                    Modular Systems
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {Array.isArray((ship.systems as any).modular?.cargo_modules) && (ship.systems as any).modular.cargo_modules.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Cargo Modules</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).modular.cargo_modules.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).modular?.hab_modules) && (ship.systems as any).modular.hab_modules.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Hab Modules</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).modular.hab_modules.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).modular?.weapon_modules) && (ship.systems as any).modular.weapon_modules.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Weapon Modules</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).modular.weapon_modules.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray((ship.systems as any).modular?.utility_modules) && (ship.systems as any).modular.utility_modules.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Utility Modules</span>
                      <ul className="list-disc list-inside text-sm">
                        {(ship.systems as any).modular.utility_modules.map((item: string, idx: number) => (
                          <li key={idx} className="text-muted-foreground">{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!(Array.isArray((ship.systems as any).modular?.cargo_modules) && (ship.systems as any).modular.cargo_modules.length > 0) &&
                   !(Array.isArray((ship.systems as any).modular?.hab_modules) && (ship.systems as any).modular.hab_modules.length > 0) &&
                   !(Array.isArray((ship.systems as any).modular?.weapon_modules) && (ship.systems as any).modular.weapon_modules.length > 0) &&
                   !(Array.isArray((ship.systems as any).modular?.utility_modules) && (ship.systems as any).modular.utility_modules.length > 0) && (
                    <p className="text-muted-foreground text-sm">N/A</p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Weaponry */}
            {ship.armament && typeof ship.armament === "object" && (
              <Card className="md:col-span-2 lg:col-span-3">
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <Target className="mr-2 h-5 w-5" />
                    {t("ships.weaponry")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {/* Weapons */}
                    {(ship.armament as any).weapons && 
                     Array.isArray((ship.armament as any).weapons) && 
                     (ship.armament as any).weapons.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center">
                          <Sword className="mr-1 h-4 w-4" />
                          {t("ships.weapons")}
                        </h4>
                        {(ship.armament as any).weapons.map((weapon: string, idx: number) => (
                          <p key={idx} className="text-sm text-muted-foreground">{weapon}</p>
                        ))}
                      </div>
                    )}
                    
                    {/* Turrets */}
                    {(ship.armament as any).turrets && 
                     Array.isArray((ship.armament as any).turrets) && 
                     (ship.armament as any).turrets.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center">
                          <Settings className="mr-1 h-4 w-4" />
                          {t("ships.turrets")}
                        </h4>
                        {(ship.armament as any).turrets.map((turret: string, idx: number) => (
                          <p key={idx} className="text-sm text-muted-foreground">{turret}</p>
                        ))}
                      </div>
                    )}
                    
                    {/* Missiles */}
                    {(ship.armament as any).missiles && 
                     Array.isArray((ship.armament as any).missiles) && 
                     (ship.armament as any).missiles.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center">
                          <Rocket className="mr-1 h-4 w-4" />
                          {t("ships.missiles")}
                        </h4>
                        {(ship.armament as any).missiles.map((missile: string, idx: number) => (
                          <p key={idx} className="text-sm text-muted-foreground">{missile}</p>
                        ))}
                      </div>
                    )}
                    
                    {/* Utility */}
                    {(ship.armament as any).utility && 
                     Array.isArray((ship.armament as any).utility) && 
                     (ship.armament as any).utility.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center">
                          <Wrench className="mr-1 h-4 w-4" />
                          {t("ships.utilityItems")}
                        </h4>
                        {(ship.armament as any).utility.map((item: string, idx: number) => (
                          <p key={idx} className="text-sm text-muted-foreground">{item}</p>
                        ))}
                      </div>
                    )}

                    {/* Countermeasures */}
                    {(ship.armament as any).countermeasures &&
                     Array.isArray((ship.armament as any).countermeasures) &&
                     (ship.armament as any).countermeasures.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="font-semibold text-sm flex items-center">
                          <Shield className="mr-1 h-4 w-4" />
                          Countermeasures
                        </h4>
                        {(ship.armament as any).countermeasures.map((item: string, idx: number) => (
                          <p key={idx} className="text-sm text-muted-foreground">{item}</p>
                        ))}
                      </div>
                    )}
                    
                     {!(ship.armament as any).weapons?.length && 
                      !(ship.armament as any).turrets?.length && 
                      !(ship.armament as any).missiles?.length && 
                      !(ship.armament as any).utility?.length &&
                      !(ship.armament as any).countermeasures?.length && (
                        <p className="text-muted-foreground text-sm col-span-full">{t("ships.noArmamentData")}</p>
                      )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Pricing */}
          {ship.prices && Array.isArray(ship.prices) && ship.prices.length > 0 && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="mr-2 h-5 w-5" />
                  {t("ships.pricing")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ship.prices.map((price: any, index: number) => (
                    <div key={index} className="space-y-1">
                      <p className="text-sm text-muted-foreground">{price.type || "Price"}</p>
                      <p className="text-lg font-semibold">
                        {price.amount ? `$${price.amount.toLocaleString()}` : "N/A"}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* External Links */}
          <Card>
            <CardHeader>
              <CardTitle>{t("ships.externalLinks")}</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-4">
              <a
                href={`https://starcitizen.tools/${ship.name.replace(/ /g, "_")}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Star Citizen Wiki
                </Button>
              </a>
              <a
                href={`https://www.erkul.games/live/calculator?ship=${ship.slug}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" className="gap-2">
                  <ExternalLink className="h-4 w-4" />
                  Erkul DPS Calculator
                </Button>
              </a>
            </CardContent>
          </Card>

          {/* FleetYards Enriched Data */}
          <ShipTags fullData={(ship as any).fleetyards_full_data} />
          <ShipImageGallery images={(ship as any).fleetyards_images} />
          <ShipVideos videos={(ship as any).fleetyards_videos} />
          <ShipLoaners loaners={(ship as any).fleetyards_loaners} />
          <ShipVariants variants={(ship as any).fleetyards_variants} />
          <ShipModules modules={(ship as any).fleetyards_modules} />
        </div>
    );
}

export default ShipDetail;
