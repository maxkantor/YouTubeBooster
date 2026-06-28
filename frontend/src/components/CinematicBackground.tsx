import { useMemo, type CSSProperties } from 'react';
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
    size: 1 + rand() * 1.2,
    opacity: 0.02 + rand() * 0.025,
    duration: 55 + rand() * 25,
    delay: rand() * -35
  }));
}

/** Single premium backdrop for every route — no page-level gradient stacks. */
export function CinematicBackground() {
  const particles = useMemo(() => buildParticles(14), []);

  return (
    <div className="cinematic-bg" aria-hidden>
      <div className="cinematic-bg__layer cinematic-bg__base" />
      <div className="cinematic-bg__layer cinematic-bg__aurora" />
      <div className="cinematic-bg__layer cinematic-bg__mesh" />
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
