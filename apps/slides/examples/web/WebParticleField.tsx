import { useEffect, useRef } from "react";

type WebParticleFieldProps = {
  color: string;
  count: number;
  label: string;
};

export default function WebParticleField({ color, count, label }: WebParticleFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const particles = Array.from({ length: count }, (_, index) => ({
      angle: (index / count) * Math.PI * 2,
      radius: 40 + (index * 37) % 280,
      speed: 0.00015 + (index % 7) * 0.000025,
      size: 1.5 + (index % 5),
    }));
    let animationFrame = 0;

    const draw = (time: number) => {
      const scale = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * scale || canvas.height !== height * scale) {
        canvas.width = width * scale;
        canvas.height = height * scale;
      }
      context.setTransform(scale, 0, 0, scale, 0, 0);
      context.clearRect(0, 0, width, height);
      context.fillStyle = color;
      context.shadowColor = color;
      context.shadowBlur = 18;
      for (const particle of particles) {
        const angle = particle.angle + time * particle.speed;
        const pulse = Math.sin(time * 0.0015 + particle.angle * 3) * 18;
        const x = width / 2 + Math.cos(angle) * (particle.radius + pulse);
        const y = height / 2 + Math.sin(angle * 1.4) * (particle.radius * 0.55 + pulse);
        context.beginPath();
        context.arc(x, y, particle.size, 0, Math.PI * 2);
        context.fill();
      }
      animationFrame = requestAnimationFrame(draw);
    };

    animationFrame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animationFrame);
  }, [color, count]);

  return (
    <main style={{ background: "#020617", color: "#f8fafc", height: "100%", overflow: "hidden", position: "relative" }}>
      <canvas ref={canvasRef} style={{ height: "100%", width: "100%" }} />
      <div style={{ left: 0, position: "absolute", right: 0, textAlign: "center", top: "44%" }}>
        <div style={{ fontFamily: "-apple-system, sans-serif", fontSize: 48, fontWeight: 750 }}>{label}</div>
        <div style={{ color, fontFamily: "ui-monospace, monospace", fontSize: 20, marginTop: 12 }}>bundled locally · no server</div>
      </div>
    </main>
  );
}
