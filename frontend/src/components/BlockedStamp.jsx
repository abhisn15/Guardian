// The moment the guard holds, given the weight it deserves.
//
// Drawn as SVG rather than shipped as an image: it has to stay sharp on a
// projector, follow the theme, and carry a state label that changes with the
// outcome. A raster stamp would do none of those.

const VARIANTS = {
  blocked: { label: "BLOCKED", sub: "funds held", color: "var(--color-alarm)" },
  frozen: { label: "FROZEN", sub: "agent disabled", color: "var(--color-alarm)" },
  drained: { label: "DRAINED", sub: "guard beaten", color: "var(--color-warn)" },
  refused: { label: "REFUSED", sub: "model declined", color: "var(--color-muted)" },
};

export default function BlockedStamp({ variant = "blocked", size = 132 }) {
  const v = VARIANTS[variant] ?? VARIANTS.blocked;
  const open = variant === "drained";

  return (
    <figure className="m-0 flex flex-col items-center gap-2 select-none">
      <svg
        width={size}
        height={size}
        viewBox="0 0 120 120"
        fill="none"
        role="img"
        aria-label={`${v.label} — ${v.sub}`}
        style={{ color: v.color }}
        className={variant === "blocked" || variant === "frozen" ? "alarm-dot" : ""}
      >
        {/* Rays — the alarm reading as a stamp rather than an icon */}
        <g stroke="currentColor" strokeWidth="4" strokeLinecap="square" opacity="0.85">
          {Array.from({ length: 12 }).map((_, i) => {
            const a = (i * Math.PI * 2) / 12;
            const r1 = 50;
            const r2 = 58;
            return (
              <line
                key={i}
                x1={60 + Math.cos(a) * r1}
                y1={60 + Math.sin(a) * r1}
                x2={60 + Math.cos(a) * r2}
                y2={60 + Math.sin(a) * r2}
              />
            );
          })}
        </g>

        {/* Double ring, deliberately uneven so it reads as inked, not printed */}
        <circle cx="60" cy="60" r="44" stroke="currentColor" strokeWidth="4" opacity="0.95" />
        <circle cx="60" cy="60" r="38" stroke="currentColor" strokeWidth="2.5" opacity="0.6" />

        {/* Shackle — open when the guard was beaten */}
        <path
          d={
            open
              ? "M48 54v-8a12 12 0 0 1 24 0"
              : "M48 54v-9a12 12 0 0 1 24 0v9"
          }
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="square"
        />

        {/* Body */}
        <rect x="42" y="54" width="36" height="28" fill="currentColor" />
        <circle cx="60" cy="65" r="4" fill="var(--color-ground)" />
        <rect x="58" y="65" width="4" height="9" fill="var(--color-ground)" />
      </svg>

      <figcaption className="text-center">
        <div
          className="font-display text-[19px] font-extrabold tracking-[0.06em] leading-none"
          style={{ color: v.color }}
        >
          {v.label}
        </div>
        <div className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-faint mt-1">
          {v.sub}
        </div>
      </figcaption>
    </figure>
  );
}
