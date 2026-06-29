import type { CinematicScene } from './cinematicScene';

type Props = { scene: CinematicScene };

/**
 * Extremely subtle creator-studio fragments — 2–8% visible, heavily cropped/blurred.
 * Feel YouTube creation; never see obvious branding or UI chrome.
 */
export function CreatorStudioFragments({ scene }: Props) {
  return (
    <div className={`creator-fragments creator-fragments--${scene}`} aria-hidden>
      {/* Blurred thumbnail wall — upper right, mostly cropped */}
      <svg className="creator-fragments__thumbs" viewBox="0 0 600 400" preserveAspectRatio="xMaxYMin slice">
        {Array.from({ length: 9 }, (_, i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          return (
            <rect
              key={i}
              x={40 + col * 168}
              y={20 + row * 118}
              width={148}
              height={96}
              rx={10}
              fill={`rgba(${30 + i * 8},${28 + i * 6},${55 + i * 10},0.35)`}
            />
          );
        })}
      </svg>

      {/* Editing timeline — bottom left fragment */}
      <svg className="creator-fragments__timeline" viewBox="0 0 800 120">
        <rect x="0" y="40" width="800" height="44" rx="6" fill="rgba(10,12,22,0.5)" />
        <rect x="24" y="52" width="140" height="20" rx="3" fill="rgba(109,93,246,0.3)" />
        <rect x="180" y="52" width="220" height="20" rx="3" fill="rgba(59,130,246,0.25)" />
        <rect x="420" y="52" width="90" height="20" rx="3" fill="rgba(127,92,255,0.28)" />
        <rect x="530" y="52" width="180" height="20" rx="3" fill="rgba(99,102,241,0.22)" />
      </svg>

      {/* Retention / CTR analytics curve */}
      <svg className="creator-fragments__analytics" viewBox="0 0 500 300">
        <polyline
          points="0,220 60,200 120,210 180,160 240,170 300,100 360,120 420,60 500,80"
          fill="none"
          stroke="rgba(127,92,255,0.35)"
          strokeWidth="2"
        />
        <polyline
          points="0,250 80,230 160,240 240,190 320,200 400,140 500,160"
          fill="none"
          stroke="rgba(59,130,246,0.25)"
          strokeWidth="1.5"
        />
      </svg>

      {/* Waveform audio */}
      <svg className="creator-fragments__waveform" viewBox="0 0 400 80">
        {Array.from({ length: 60 }, (_, i) => {
          const h = 8 + Math.sin(i * 0.4) * 22 + Math.cos(i * 0.15) * 10;
          return (
            <rect key={i} x={i * 6.5} y={40 - h / 2} width={4} height={h} rx={2} fill="rgba(109,93,246,0.28)" />
          );
        })}
      </svg>

      {/* Neural keyword mesh */}
      <svg className="creator-fragments__neural" viewBox="0 0 400 300">
        {[
          [80, 60], [180, 40], [280, 80], [320, 160], [200, 200], [100, 180]
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={5} fill="rgba(127,92,255,0.3)" />
        ))}
        <line x1="80" y1="60" x2="180" y2="40" stroke="rgba(109,93,246,0.12)" />
        <line x1="180" y1="40" x2="280" y2="80" stroke="rgba(109,93,246,0.1)" />
        <line x1="280" y1="80" x2="320" y2="160" stroke="rgba(59,130,246,0.1)" />
        <line x1="200" y1="200" x2="320" y2="160" stroke="rgba(127,92,255,0.08)" />
        <line x1="100" y1="180" x2="200" y2="200" stroke="rgba(109,93,246,0.08)" />
      </svg>

      {/* Color grading panel hint */}
      <div className="creator-fragments__grading" />

      {/* Film strip + bokeh orbs */}
      <div className="creator-fragments__filmstrip" />
      <div className="creator-fragments__bokeh" />
    </div>
  );
}
