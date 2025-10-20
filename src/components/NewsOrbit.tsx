import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from 'react-i18next';

interface NewsItem {
  id: number;
  title: string;
  date: string;
  category: string;
  angle: number;
}

const newsItems: NewsItem[] = [
  {
    id: 1,
    title: "New Patch 3.24 Released",
    date: "2025-01-15",
    category: "Update",
    angle: 0
  },
  {
    id: 2,
    title: "Pyro System Coming Soon",
    date: "2025-01-10",
    category: "Feature",
    angle: 72
  },
  {
    id: 3,
    title: "Ship Sale: Drake Vulture",
    date: "2025-01-05",
    category: "Sale",
    angle: 144
  },
  {
    id: 4,
    title: "Community Event Weekend",
    date: "2025-01-01",
    category: "Event",
    angle: 216
  },
  {
    id: 5,
    title: "Performance Improvements",
    date: "2024-12-28",
    category: "Tech",
    angle: 288
  }
];

export function NewsOrbit() {
  const { t } = useTranslation();
  const orbitRadius = 300;

  return (
    <div className="relative w-full h-[700px] flex items-center justify-center my-12">
      {/* Central Sun */}
      <motion.div
        className="absolute w-32 h-32 rounded-full bg-gradient-to-br from-neon-orange via-neon-pink to-neon-purple shadow-2xl"
        style={{
          boxShadow: '0 0 60px rgba(251, 77, 255, 0.8), 0 0 100px rgba(255, 144, 77, 0.4)'
        }}
        animate={{
          rotate: 360,
          scale: [1, 1.1, 1],
        }}
        transition={{
          rotate: { duration: 20, repeat: Infinity, ease: "linear" },
          scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold text-white">NEWS</span>
        </div>
      </motion.div>

      {/* Orbit Ring */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full border-2 border-dashed border-primary/20"
        animate={{ rotate: 360 }}
        transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
      />

      {/* News Items Orbiting */}
      {newsItems.map((news, index) => {
        const radian = (news.angle * Math.PI) / 180;
        const x = Math.cos(radian) * orbitRadius;
        const y = Math.sin(radian) * orbitRadius;

        return (
          <motion.div
            key={news.id}
            className="absolute"
            style={{
              left: '50%',
              top: '50%',
            }}
            initial={{ x, y }}
            animate={{
              x: [x, Math.cos(radian + Math.PI * 2) * orbitRadius],
              y: [y, Math.sin(radian + Math.PI * 2) * orbitRadius],
            }}
            transition={{
              duration: 30,
              repeat: Infinity,
              ease: "linear",
              delay: index * 0.5
            }}
          >
            <Card className="w-64 bg-card/90 backdrop-blur-md border-primary/30 hover:border-primary transition-all hover:scale-105 animate-float">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between mb-2">
                  <Badge
                    variant="secondary"
                    className={
                      news.category === 'Update' ? 'bg-neon-blue/20 text-neon-blue border-neon-blue/30' :
                      news.category === 'Feature' ? 'bg-neon-purple/20 text-neon-purple border-neon-purple/30' :
                      news.category === 'Sale' ? 'bg-neon-orange/20 text-neon-orange border-neon-orange/30' :
                      news.category === 'Event' ? 'bg-neon-pink/20 text-neon-pink border-neon-pink/30' :
                      'bg-primary/20 text-primary border-primary/30'
                    }
                  >
                    {news.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(news.date).toLocaleDateString()}
                  </span>
                </div>
                <CardTitle className="text-lg">{news.title}</CardTitle>
              </CardHeader>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
