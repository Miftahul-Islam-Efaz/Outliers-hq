type P = { size?: number }
const s = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
})

/* Simple, flat, single-weight icons in the Milanote spirit. */

export const IconCursor = ({ size = 18 }: P) => (
  <svg {...s(size)}>
    <path d="M6 3.5l12.5 8.2-5.6 1.1 2.6 5.7-2.3 1-2.6-5.7-3.4 3.6z" />
  </svg>
)

export const IconText = ({ size = 18 }: P) => (
  <svg {...s(size)}>
    <path d="M4.5 6.5V5h15v1.5M12 5v14M9.5 19h5" />
  </svg>
)

export const IconShapes = ({ size = 18 }: P) => (
  <svg {...s(size)}>
    <rect x="3.5" y="11" width="9.5" height="9.5" rx="1.6" />
    <circle cx="16" cy="7.5" r="4" />
  </svg>
)

export const IconPen = ({ size = 18 }: P) => (
  <svg {...s(size)}>
    <path d="M16.8 3.9a1.9 1.9 0 0 1 2.7 2.7L8.7 17.4l-4 1.3 1.3-4z" />
    <path d="M15.2 5.5l3.3 3.3" />
  </svg>
)

export const IconSquare = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <rect x="4" y="4" width="16" height="16" />
  </svg>
)

export const IconRound = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <rect x="4" y="4" width="16" height="16" rx="5" />
  </svg>
)

export const IconEllipse = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <circle cx="12" cy="12" r="8" />
  </svg>
)

export const IconDiamond = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <path d="M12 3.5L20.5 12 12 20.5 3.5 12z" />
  </svg>
)

export const IconTriangle = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <path d="M12 4.5l8 15H4z" />
  </svg>
)

export const IconAlignLeft = ({ size = 15 }: P) => (
  <svg {...s(size)}>
    <path d="M4 7h16M4 12h10M4 17h13" />
  </svg>
)

export const IconAlignCenter = ({ size = 15 }: P) => (
  <svg {...s(size)}>
    <path d="M4 7h16M7 12h10M6 17h12" />
  </svg>
)

export const IconAlignRight = ({ size = 15 }: P) => (
  <svg {...s(size)}>
    <path d="M4 7h16M10 12h10M7 17h13" />
  </svg>
)

export const IconDuplicate = ({ size = 15 }: P) => (
  <svg {...s(size)}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9" />
  </svg>
)

export const IconUndo = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M4.5 9h9.5a4.5 4.5 0 0 1 0 9H8" />
    <path d="M8 4.5L4 9l4 4.5" />
  </svg>
)

export const IconRedo = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M19.5 9H10a4.5 4.5 0 0 0 0 9h6" />
    <path d="M16 4.5L20 9l-4 4.5" />
  </svg>
)

export const IconFit = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M4 9.5V4h5.5M20 9.5V4h-5.5M4 14.5V20h5.5M20 14.5V20h-5.5" />
  </svg>
)

export const IconTextStyle = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <path d="M4 8V6.5h9V8M8.5 6.5v11M6.5 17.5h4" />
    <path d="M15 12v-1h5v1M17.5 11v6.5M16 17.5h3" />
  </svg>
)

export const IconEraser = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M8.5 19.5H19M4.8 16.2l6-6a2 2 0 0 1 2.8 0l3.6 3.6a2 2 0 0 1 0 2.8l-3 3H8.4l-3.6-3.6z" />
  </svg>
)
