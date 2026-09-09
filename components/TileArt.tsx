import type { ArtVariant } from "@/lib/mosaic"

/**
 * Thin line-art geometry for a mosaic tile. Stroke only, never filled, and
 * deliberately drawn past the viewBox so the tile's overflow crops it — that
 * cropping is what makes a tile read as a fragment of something larger.
 */
export default function TileArt({ variant, color }: { variant: ArtVariant; color: string }) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 1,
    vectorEffect: "non-scaling-stroke" as const,
  }

  return (
    <svg
      className="tile-art"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {variant === "a" ? (
        <g {...common}>
          {/* Three equal circles in a row, running off both side edges. */}
          <circle cx="-2" cy="52" r="34" />
          <circle cx="50" cy="52" r="34" />
          <circle cx="102" cy="52" r="34" />
        </g>
      ) : null}

      {variant === "b" ? (
        <g {...common}>
          {/* Off-centre rings; the outermost is cropped by the right edge. */}
          <circle cx="74" cy="50" r="62" />
          <circle cx="74" cy="50" r="44" />
          <circle cx="74" cy="50" r="27" />
          <circle cx="74" cy="50" r="12" />
        </g>
      ) : null}

      {variant === "c" ? (
        <g {...common}>
          {/* Loose cluster of small circles with dots floating above. */}
          <circle cx="26" cy="62" r="13" />
          <circle cx="48" cy="62" r="13" />
          <circle cx="70" cy="62" r="13" />
          <circle cx="37" cy="82" r="13" />
          <circle cx="59" cy="82" r="13" />
          <circle cx="81" cy="82" r="13" />
          <circle cx="22" cy="34" r="1.6" />
          <circle cx="42" cy="30" r="1.6" />
          <circle cx="62" cy="34" r="1.6" />
          <circle cx="82" cy="28" r="1.6" />
        </g>
      ) : null}

      {variant === "d" ? (
        <g {...common}>
          {/* Wireframe dome: outline plus four meridians, cropped at the base. */}
          <circle cx="50" cy="58" r="46" />
          <path d="M50 12 C 22 40, 22 76, 50 104" />
          <path d="M50 12 C 78 40, 78 76, 50 104" />
          <path d="M50 12 C 34 40, 34 76, 50 104" />
          <path d="M50 12 C 66 40, 66 76, 50 104" />
        </g>
      ) : null}
    </svg>
  )
}
