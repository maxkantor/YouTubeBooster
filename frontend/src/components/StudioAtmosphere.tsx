import type { CinematicScene } from './cinematicScene';

type Props = { scene: CinematicScene };

/**
 * Abstract creator-studio fragments — blurred, layered, never literal branding.
 * Subconscious YouTube creation cues: thumbnails, timelines, waveforms, analytics, neural mesh.
 */
export function StudioAtmosphere({ scene }: Props) {
  return (
    <div className={`studio-atmosphere studio-atmosphere--${scene}`} aria-hidden>
      {/* Layer 2 — studio silhouettes (monitors, workspace) */}
      <svg className="studio-atmosphere__layer studio-atmosphere__silhouettes" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="sa-monitor" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(30,35,55,0.5)" />
            <stop offset="100%" stopColor="rgba(8,10,18,0.2)" />
          </linearGradient>
          <linearGradient id="sa-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(109,93,246,0.15)" />
            <stop offset="100%" stopColor="rgba(59,130,246,0.08)" />
          </linearGradient>
        </defs>
        <rect x="980" y="120" width="420" height="240" rx="8" fill="url(#sa-monitor)" opacity="0.7" />
        <rect x="1000" y="140" width="380" height="200" rx="4" fill="rgba(20,24,40,0.35)" />
        <rect x="60" y="480" width="520" height="300" rx="10" fill="url(#sa-monitor)" opacity="0.55" />
        <rect x="80" y="500" width="480" height="260" rx="4" fill="rgba(15,18,32,0.4)" />
        <ellipse cx="1280" cy="780" rx="180" ry="40" fill="rgba(0,0,0,0.35)" />
        <rect x="1180" y="620" width="200" height="120" rx="60" fill="rgba(25,28,45,0.25)" />
      </svg>

      {/* Layer 3 — analytics overlays */}
      <svg className="studio-atmosphere__layer studio-atmosphere__analytics" viewBox="0 0 1600 900">
        <polyline
          points="100,680 220,620 340,640 460,520 580,480 700,420 820,380 940,300 1060,280 1180,220"
          fill="none"
          stroke="rgba(127,92,255,0.25)"
          strokeWidth="2"
        />
        <polyline
          points="120,720 280,660 400,700 560,580 720,560 880,460 1040,440 1200,360"
          fill="none"
          stroke="rgba(59,130,246,0.2)"
          strokeWidth="1.5"
        />
        <rect x="1240" y="160" width="280" height="160" rx="12" fill="rgba(12,14,24,0.35)" stroke="rgba(255,255,255,0.04)" />
        <rect x="1260" y="200" width="40" height="90" rx="4" fill="rgba(109,93,246,0.2)" />
        <rect x="1310" y="170" width="40" height="120" rx="4" fill="rgba(127,92,255,0.28)" />
        <rect x="1360" y="220" width="40" height="70" rx="4" fill="rgba(59,130,246,0.22)" />
        <rect x="1410" y="185" width="40" height="105" rx="4" fill="rgba(109,93,246,0.18)" />
      </svg>

      {/* Layer 4 — blurred thumbnail grid */}
      <svg className="studio-atmosphere__layer studio-atmosphere__thumbnails" viewBox="0 0 1600 900">
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const col = i % 3;
          const row = Math.floor(i / 3);
          const x = 140 + col * 148;
          const y = 80 + row * 108;
          const hues = ['#1e1b4b', '#172554', '#1a1035', '#0f172a', '#1e293b', '#312e81'];
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width={132}
              height={88}
              rx={8}
              fill={hues[i]}
              opacity={0.35 + (i % 3) * 0.05}
            />
          );
        })}
        {[0, 1, 2, 3].map((i) => (
          <rect
            key={`r-${i}`}
            x={1320 + (i % 2) * 120}
            y={520 + Math.floor(i / 2) * 100}
            width={108}
            height={72}
            rx={6}
            fill={`rgba(${80 + i * 20},${70 + i * 15},${140 + i * 10},0.25)`}
          />
        ))}
      </svg>

      {/* Layer 5 — neural / keyword mesh */}
      <svg className="studio-atmosphere__layer studio-atmosphere__neural" viewBox="0 0 1600 900">
        {[
          [200, 200], [380, 140], [520, 260], [340, 320], [180, 380], [480, 400]
        ].map(([cx, cy], i) => (
          <circle key={i} cx={cx} cy={cy} r={6} fill="rgba(127,92,255,0.35)" />
        ))}
        <line x1="200" y1="200" x2="380" y2="140" stroke="rgba(109,93,246,0.12)" />
        <line x1="380" y1="140" x2="520" y2="260" stroke="rgba(109,93,246,0.1)" />
        <line x1="200" y1="200" x2="340" y2="320" stroke="rgba(59,130,246,0.1)" />
        <line x1="340" y1="320" x2="480" y2="400" stroke="rgba(127,92,255,0.08)" />
        <line x1="520" y1="260" x2="480" y2="400" stroke="rgba(109,93,246,0.1)" />
        <line x1="180" y1="380" x2="340" y2="320" stroke="rgba(59,130,246,0.08)" />
      </svg>

      {/* Editing timeline + waveform */}
      <svg className="studio-atmosphere__layer studio-atmosphere__timeline" viewBox="0 0 1600 900">
        <rect x="200" y="620" width="1000" height="48" rx="6" fill="rgba(10,12,22,0.45)" />
        <rect x="220" y="632" width="120" height="24" rx="3" fill="rgba(109,93,246,0.25)" />
        <rect x="360" y="632" width="200" height="24" rx="3" fill="rgba(59,130,246,0.2)" />
        <rect x="580" y="632" width="80" height="24" rx="3" fill="rgba(127,92,255,0.22)" />
        <rect x="680" y="632" width="160" height="24" rx="3" fill="rgba(99,102,241,0.18)" />
        <rect x="860" y="632" width="240" height="24" rx="3" fill="rgba(109,93,246,0.2)" />
        <line x1="540" y1="700" x2="540" y2="820" stroke="rgba(251,146,60,0.15)" strokeWidth="1" strokeDasharray="4 6" />
        {Array.from({ length: 80 }, (_, i) => {
          const h = 12 + Math.sin(i * 0.35) * 18 + Math.cos(i * 0.12) * 8;
          return (
            <rect
              key={i}
              x={240 + i * 10}
              y={760 - h / 2}
              width={5}
              height={h}
              rx={2}
              fill="rgba(127,92,255,0.2)"
            />
          );
        })}
      </svg>

      {/* Color grading panel hints */}
      <div className="studio-atmosphere__grading" />
      <div className="studio-atmosphere__bokeh" />
    </div>
  );
}
