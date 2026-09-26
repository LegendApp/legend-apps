type WebParticleFieldProps = { color: string; count: number; label: string };
/** Browser compositor animations require no JavaScript frame loop. */
export default function WebParticleField({ color, count, label }: WebParticleFieldProps) {
  return <main style={{ background: "#020617", color: "#f8fafc", height: "100%", overflow: "hidden", position: "relative" }}>
    <style>{`@keyframes orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @media (prefers-reduced-motion: reduce) { .particle-orbit { animation: none !important; } }`}</style>
    {Array.from({ length: Math.max(0, Math.min(500, Math.floor(count))) }, (_, index) => {
      const radius = 40 + index * 37 % 280, size = 1.5 + index % 5;
      return <div key={index} className="particle-orbit" style={{ position: "absolute", left: "50%", top: "50%", animation: `orbit ${28 + index % 7 * 4}s linear infinite`, animationDelay: `${-index * 2.7}s` }}>
        <div style={{ transform: `translateX(${radius}px)`, width: size * 2, height: size * 2, borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 18px ${color}` }} />
      </div>;
    })}
    <div style={{ left: 0, position: "absolute", right: 0, textAlign: "center", top: "44%" }}>
      <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: 48, fontWeight: 750 }}>{label}</div>
      <div style={{ color, fontFamily: "ui-monospace, monospace", fontSize: 20, marginTop: 12 }}>bundled locally · no server</div>
    </div>
  </main>;
}
