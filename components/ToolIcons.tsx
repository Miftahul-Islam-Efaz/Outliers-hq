type P = { size?: number }
const s = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
})

export const IconCursor = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M5 3l6 17 2.2-6.2L19.5 12z" />
  </svg>
)

export const IconText = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M5 6h14M12 6v13M9 19h6" />
  </svg>
)

export const IconShapes = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <rect x="3.5" y="12" width="8.5" height="8.5" rx="1.5" />
    <circle cx="16" cy="7.5" r="4.2" />
  </svg>
)

export const IconPen = ({ size = 17 }: P) => (
  <svg {...s(size)}>
    <path d="M3 20c3-1 4-6 8-9s6-6 8-6-1 4-4 7-8 4-9 8" />
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
    <ellipse cx="12" cy="12" rx="8.5" ry="7" />
  </svg>
)

export const IconDiamond = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <path d="M12 3.5L20.5 12 12 20.5 3.5 12z" />
  </svg>
)

export const IconTriangle = ({ size = 16 }: P) => (
  <svg {...s(size)}>
    <path d="M12 4l8.5 16h-17z" />
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
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 5.5h-9a2 2 0 0 0-2 2v9" />
  </svg>
)

export const IconUndo = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h9a5 5 0 0 1 0 10H7" />
    <path d="M4 8l4-4M4 8l4 4" />
  </svg>
)

export const IconRedo = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 8h-9a5 5 0 0 0 0 10h6" />
    <path d="M20 8l-4-4M20 8l-4 4" />
  </svg>
)

export const IconFit = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
)
