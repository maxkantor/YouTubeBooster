import { useMemo, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveCinematicScene } from './cinematicScene';
import { StudioAtmosphere } from './StudioAtmosphere';
import './cinematic-background.css';

type Particle = { id: number; x: number; y: number; size: number; opacity: number; duration: number; delay: number };

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildParticles(count: number): Particle[] {
  const rand = mulberry32(0x51a9f00d);
  return Array.from({ length: count }, (_, id) => ({
    id,
    x: rand() * 100,
    y: rand() * 100,
    size: 0.8 + rand() * 1.2,
    opacity: 0.02 + rand() * 0.035,
    duration: 42 + rand() * 24,
    delay: rand() * -50
  }));
}

/**
 * Eight-layer cinematic creator studio — page-aware atmosphere, GPU-friendly CSS motion.
 */
export function CinematicBackground() {
  const { pathname } = useLocation();
  const scene = resolveCinematicScene(pathname);
  const particles = useMemo(() => buildParticles(28), []);

  return (
    <div className={`cinematic-bg cinematic-bg--${scene}`} aria-hidden data-scene={scene}>
      {/* 1 — deep black base */}
      <div className="cinematic-bg__layer cinematic-bg__base" />

      {/* 2–5 — studio fragments (silhouettes, analytics, thumbnails, neural, timeline) */}
      <div className="cinematic-bg__layer cinematic-bg__studio">
        <StudioAtmosphere scene={scene} />
      </div>

      {/* 6 — Hollywood lighting */}
      <div className="cinematic-bg__layer cinematic-bg__light cinematic-bg__light--blue" />
      <div className="cinematic-bg__layer cinematic-bg__light cinematic-bg__light--purple" />
      <div className="cinematic-bg__layer cinematic-bg__light cinematic-bg__light--warm" />
      <div className="cinematic-bg__layer cinematic-bg__volumetric" />
      <div className="cinematic-bg__layer cinematic-bg__flare" />

      {/* 7 — dust particles */}
      <div className="cinematic-bg__layer cinematic-bg__particles">
        {particles.map((p) => (
          <span
            key={p.id}
            className="cinematic-bg__particle"
            style={
              {
                left: `${p.x}%`,
                top: `${p.y}%`,
                width: `${p.size}px`,
                height: `${p.size}px`,
                opacity: p.opacity,
                ['--cinematic-duration' as string]: `${p.duration}s`,
                animationDelay: `${p.delay}s`
              } as CSSProperties
            }
          />
        ))}
      </div>

      {/* 8 — atmospheric fog + vignette + grain */}
      <div className="cinematic-bg__layer cinematic-bg__fog" />
      <div className="cinematic-bg__layer cinematic-bg__vignette" />
      <div className="cinematic-bg__layer cinematic-bg__noise" />
    </div>
  );
}
