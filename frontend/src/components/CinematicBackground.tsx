import { useMemo, type CSSProperties } from 'react';
import { PremiumBackdropArt } from './PremiumBackdropArt';
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
    size: 1 + rand() * 1.4,
    opacity: 0.025 + rand() * 0.03,
    duration: 50 + rand() * 30,
    delay: rand() * -40
  }));
}

/**
 * Premium cinematic environment — competitor-grade depth without page-level gradient stacks.
 * Center-stage purple bloom, floating glass creator icons, lens flares, aurora mesh.
 */
export function CinematicBackground() {
  const particles = useMemo(() => buildParticles(20), []);

  return (
    <div className="cinematic-bg" aria-hidden>
      <div className="cinematic-bg__layer cinematic-bg__base" />
      <div className="cinematic-bg__layer cinematic-bg__stage" />
      <div className="cinematic-bg__layer cinematic-bg__horizon" />
      <div className="cinematic-bg__layer cinematic-bg__aurora" />
      <div className="cinematic-bg__layer cinematic-bg__mesh" />
      <div className="cinematic-bg__layer cinematic-bg__flares" />
      <div className="cinematic-bg__layer cinematic-bg__shapes">
        <PremiumBackdropArt />
      </div>
      <div className="cinematic-bg__layer cinematic-bg__glow cinematic-bg__glow--purple" />
      <div className="cinematic-bg__layer cinematic-bg__glow cinematic-bg__glow--blue" />
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
      <div className="cinematic-bg__layer cinematic-bg__vignette" />
      <div className="cinematic-bg__layer cinematic-bg__noise" />
    </div>
  );
}
