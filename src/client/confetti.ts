// A short burst of confetti when a proposal has just been accepted.
export const confetti = () => {
  const canvas = document.getElementById("confetti") as HTMLCanvasElement | null;
  if (!canvas || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d")!;
  const dpr = devicePixelRatio || 1;
  const size = () => ((canvas.width = innerWidth * dpr), (canvas.height = innerHeight * dpr));
  size();
  addEventListener("resize", size);
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#1d6b57";
  const colours = [accent, "#f6c344", "#4cb3a3", "#6c7ce0", "#ef6f9a"];
  const bits = Array.from({ length: 160 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 160, y: innerHeight * 0.4,
    vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 16 - 6,
    r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
    w: 6 + Math.random() * 6, h: 8 + Math.random() * 8, c: colours[Math.floor(Math.random() * colours.length)],
  }));
  let frames = 0;
  const tick = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save();
      ctx.translate(b.x * dpr, b.y * dpr);
      ctx.rotate(b.r);
      ctx.fillStyle = b.c;
      ctx.fillRect((-b.w / 2) * dpr, (-b.h / 2) * dpr, b.w * dpr, b.h * Math.cos(frames / 6 + b.r) * dpr);
      ctx.restore();
    }
    if (++frames < 260) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  requestAnimationFrame(tick);
};
