type P = { size?: number }

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
})

export const IconNotes = ({ size = 19 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
  </svg>
)

export const IconBoard = ({ size = 19 }: P) => (
  <svg {...base(size)}>
    <rect x="3" y="4" width="7" height="6" rx="1.6" />
    <rect x="14" y="9" width="7" height="6" rx="1.6" />
    <rect x="6" y="14" width="7" height="6" rx="1.6" />
    <path d="M10 7h4M17.5 15v2.5H13" />
  </svg>
)

export const IconSearch = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-3.6-3.6" />
  </svg>
)

export const IconPlus = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconUp = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M7 20V10l4.2-6.2c1.4.2 2.1 1 2.1 2.4V10h4.1c1.4 0 2.3 1.1 2 2.5l-1.3 5.6c-.3 1.2-1.1 1.9-2.3 1.9H7z" />
  </svg>
)

export const IconDown = ({ size = 14 }: P) => (
  <svg {...base(size)}>
    <path d="M17 4v10l-4.2 6.2c-1.4-.2-2.1-1-2.1-2.4V14H6.6c-1.4 0-2.3-1.1-2-2.5l1.3-5.6C6.2 4.7 7 4 8.2 4H17z" />
  </svg>
)

export const IconLink = ({ size = 13 }: P) => (
  <svg {...base(size)}>
    <path d="M10 13.5a4 4 0 005.7 0l3-3a4 4 0 10-5.7-5.7l-1 1" />
    <path d="M14 10.5a4 4 0 00-5.7 0l-3 3a4 4 0 105.7 5.7l1-1" />
  </svg>
)

export const IconPlay = ({ size = 16 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M8.5 6.2v11.6c0 .5.6.9 1 .6l9-5.8c.4-.2.4-.8 0-1.1l-9-5.8c-.4-.3-1 0-1 .5z" />
  </svg>
)

export const IconLogout = ({ size = 18 }: P) => (
  <svg {...base(size)}>
    <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" />
    <path d="M15 8l4 4-4 4M19 12H9" />
  </svg>
)

export const IconCard = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <rect x="4" y="5" width="16" height="14" rx="2.2" />
    <path d="M7.5 9.5h9M7.5 13h6" />
  </svg>
)

export const IconSticky = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <path d="M5 4h14v10l-5 5H5z" />
    <path d="M19 14h-5v5" />
  </svg>
)

export const IconConnect = ({ size = 17 }: P) => (
  <svg {...base(size)}>
    <circle cx="6" cy="6.5" r="2.5" />
    <circle cx="18" cy="17.5" r="2.5" />
    <path d="M8.5 7.5c4 1 5.5 4 7 8" />
  </svg>
)

export const IconTrash = ({ size = 13 }: P) => (
  <svg {...base(size)}>
    <path d="M4 7h16M9 7V5h6v2M6.5 7l.8 12h9.4l.8-12" />
  </svg>
)

export const IconMinus = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <path d="M5 12h14" />
  </svg>
)

export const IconTarget = ({ size = 15 }: P) => (
  <svg {...base(size)}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </svg>
)
