export default function PageSkeleton({ label }: { label: string }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">{label}</div>
          <div className="skeleton sk-title" />
          <div className="skeleton sk-sub" />
        </div>
      </div>
      <div className="skeleton sk-bar" />
      <div className="grid">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="skeleton sk-card" key={i} />
        ))}
      </div>
    </div>
  )
}
