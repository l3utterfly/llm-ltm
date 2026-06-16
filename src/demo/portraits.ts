// Procedural portrait generator — DEMO ONLY.
// Produces a distinct, fully offline SVG portrait per character as a data URI,
// so the picker / detail / ingest screens have real images without any network.
// In a real Layla build these come from the host via characters.getImage(...).

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A calm, "memory-orb" portrait: layered radial aura + drifting glyph constellation. */
export function makePortrait(name: string, hueBase: number): string {
  const rng = mulberry32(hashString(name) ^ Math.round(hueBase * 7));
  const h1 = hueBase;
  const h2 = (hueBase + 40 + rng() * 50) % 360;
  const h3 = (hueBase + 200 + rng() * 40) % 360;

  const star = (n: number) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = 12 + rng() * 376;
      const y = 12 + rng() * 376;
      const r = 0.6 + rng() * 2.2;
      const o = 0.25 + rng() * 0.6;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(
        1,
      )}" fill="#fff" opacity="${o.toFixed(2)}"/>`;
    }
    return s;
  };

  const blob = (cx: number, cy: number, r: number, hue: number, op: number) =>
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="hsl(${hue} 80% 60%)" opacity="${op}"/>`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <radialGradient id="bg" cx="42%" cy="36%" r="80%">
      <stop offset="0%" stop-color="hsl(${h1} 70% 26%)"/>
      <stop offset="55%" stop-color="hsl(${h3} 55% 12%)"/>
      <stop offset="100%" stop-color="#141414"/>
    </radialGradient>
    <radialGradient id="orb" cx="50%" cy="44%" r="60%">
      <stop offset="0%" stop-color="hsl(${h2} 92% 72%)" stop-opacity="0.95"/>
      <stop offset="45%" stop-color="hsl(${h1} 88% 58%)" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="hsl(${h1} 80% 40%)" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="400" height="400" fill="url(#bg)"/>
  ${star(70)}
  <g filter="url(#soft)" opacity="0.9">
    ${blob(150 + rng() * 100, 150 + rng() * 90, 120, h2, 0.5)}
    ${blob(220 + rng() * 80, 120 + rng() * 60, 80, h1, 0.45)}
  </g>
  <circle cx="200" cy="184" r="120" fill="url(#orb)"/>
  <circle cx="200" cy="184" r="118" fill="none" stroke="hsl(${h2} 90% 78%)" stroke-opacity="0.35" stroke-width="1.5"/>
  <circle cx="200" cy="184" r="150" fill="none" stroke="hsl(${h2} 90% 78%)" stroke-opacity="0.12" stroke-width="1"/>
</svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
