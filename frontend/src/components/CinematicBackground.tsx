import { useMemo, type CSSProperties } from 'react';
import { useLocation } from 'react-router-dom';
import { resolveCinematicScene } from './cinematicScene';
import { CreatorStudioFragments } from './CreatorStudioFragments';
import { CinematicGlassOrbs } from './CinematicGlassOrbs';
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
    size: 0.9 + rand() * 1.3,
    opacity: 0.022 + rand() * 0.028,
    duration: 48 + rand() * 20,
    delay: rand() * -45
  }));
}

/**
 * Evolved cinematic environment — aurora, horizon, depth, subtle creator fragments.
 * Page-aware scenes; GPU-friendly 40–60s motion loops.
 */
export function CinematicBackground() {
  const { pathname } = useLocation();
  const scene = resolveCinematicScene(pathname);
  const particles = useMemo(() => buildParticles(24), []);

  return (
    <div className={`cinematic-bg cinematic-bg--${scene}`} aria-hidden data-scene={scene}>
      <div className="cinematic-bg__layer cinematic-bg__base" />
      <div className="cinematic-bg__layer cinematic-bg__stage" />
      <div className="cinematic-bg__layer cinematic-bg__hub" />
      <div className="cinematic-bg__layer cinematic-bg__horizon" />
      <div className="cinematic-bg__layer cinematic-bg__floor" />
      <div className="cinematic-bg__layer cinematic-bg__aurora" />
      <div className="cinematic-bg__layer cinematic-bg__mesh" />
      <div className="cinematic-bg__layer cinematic-bg__flares" />
      <div className="cinematic-bg__layer cinematic-bg__fragments">
        <CreatorStudioFragments scene={scene} />
      </div>
      <div className="cinematic-bg__layer cinematic-bg__orbs">
        <CinematicGlassOrbs />
      </div>
      <div className="cinematic-bg__layer cinematic-bg__glow cinematic-bg__glow--purple" />
      <div className="cinematic-bg__layer cinematic-bg__glow cinematic-bg__glow--blue" />
      <div className="cinematic-bg__layer cinematic-bg__glow cinematic-bg__glow--warm" />
      <div className="cinematic-bg__layer cinematic-bg__glow cinematic-bg__glow--warm-floor" />
      <div className="cinematic-bg__layer cinematic-bg__volumetric" />
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
      <div className="cinematic-bg__layer cinematic-bg__fog" />
      <div className="cinematic-bg__layer cinematic-bg__vignette" />
      <div className="cinematic-bg__layer cinematic-bg__noise" />
    </div>
  );
}
