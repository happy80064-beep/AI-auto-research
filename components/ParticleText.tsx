import React, { useEffect, useRef, useState } from 'react';

interface ParticleTextProps {
  text: string;
  className?: string; // Expects Tailwind font classes (e.g. text-5xl font-bold)
  color?: string;
  particleSize?: number;
  gap?: number; // Distance between particles (higher = fewer particles)
  mouseRadius?: number;
}

class Particle {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  size: number;
  density: number;
  color: string;

  constructor(x: number, y: number, baseX: number, baseY: number, size: number, color: string) {
    // Start from a random position for the "Aggregation" effect
    // We scatter them outwards significantly to create a "gathering" visual
    const randomAngle = Math.random() * Math.PI * 2;
    const randomDist = Math.random() * 500 + 100; // Start 100-600px away
    
    this.x = baseX + Math.cos(randomAngle) * randomDist;
    this.y = baseY + Math.sin(randomAngle) * randomDist;
    this.baseX = baseX;
    this.baseY = baseY;
    this.size = size;
    this.density = (Math.random() * 30) + 1;
    this.color = color;
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fill();
  }

  update(mouse: { x: number, y: number, radius: number }) {
    // Mouse Interaction
    let dx = mouse.x - this.x;
    let dy = mouse.y - this.y;
    let distance = Math.sqrt(dx * dx + dy * dy);
    let forceDirectionX = dx / distance;
    let forceDirectionY = dy / distance;
    let maxDistance = mouse.radius;
    let force = (maxDistance - distance) / maxDistance;
    let directionX = forceDirectionX * force * this.density;
    let directionY = forceDirectionY * force * this.density;

    if (distance < mouse.radius) {
      this.x -= directionX;
      this.y -= directionY;
    } else {
      // Aggregation Logic (Return to base)
      if (this.x !== this.baseX) {
        let dx = this.x - this.baseX;
        this.x -= dx / 15; // Ease factor
      }
      if (this.y !== this.baseY) {
        let dy = this.y - this.baseY;
        this.y -= dy / 15;
      }
    }
  }
}

export const ParticleText: React.FC<ParticleTextProps> = ({ 
  text, 
  className = "", 
  color = "#000000",
  particleSize = 1.5,
  gap = 3,
  mouseRadius = 60
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const particlesRef = useRef<Particle[]>([]);
  const animationRef = useRef<number>(0);
  const mouseRef = useRef({ x: -9999, y: -9999, radius: mouseRadius });

  // Handle Resize and Text Measurement
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight
        });
      }
    };

    window.addEventListener('resize', handleResize);
    // Initial measurement delay to ensure fonts/layout are ready
    setTimeout(handleResize, 100);

    return () => window.removeEventListener('resize', handleResize);
  }, [text]);

  // Init Particles
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || dimensions.width === 0 || dimensions.height === 0) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    // 1. Draw Text to Canvas to get pixel data
    // We need to match the font styles from the container/className
    const computedStyle = window.getComputedStyle(containerRef.current!);
    const fontSize = parseFloat(computedStyle.fontSize);
    const fontFamily = computedStyle.fontFamily;
    const fontWeight = computedStyle.fontWeight;
    const lineHeight = parseFloat(computedStyle.lineHeight) || fontSize * 1.2;

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Handle Multi-line text (\n)
    const lines = text.split('\n');
    const startY = (canvas.height - (lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, startY + (i * lineHeight));
    });

    // 2. Scan pixel data
    const textCoordinates = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const particles: Particle[] = [];

    // Clear canvas before drawing particles
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let y = 0, y2 = textCoordinates.height; y < y2; y += gap) {
      for (let x = 0, x2 = textCoordinates.width; x < x2; x += gap) {
        // Check alpha value (4th byte)
        if (textCoordinates.data[(y * 4 * textCoordinates.width) + (x * 4) + 3] > 128) {
           particles.push(new Particle(x, y, x, y, particleSize, color));
        }
      }
    }

    particlesRef.current = particles;

    // 3. Animation Loop
    const animate = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < particlesRef.current.length; i++) {
            particlesRef.current[i].draw(ctx);
            particlesRef.current[i].update(mouseRef.current);
        }
        animationRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animationRef.current);

  }, [text, dimensions, color, gap, particleSize]);

  // Mouse Interaction Handlers
  const handleMouseMove = (e: React.MouseEvent) => {
      if (canvasRef.current) {
          const rect = canvasRef.current.getBoundingClientRect();
          mouseRef.current.x = e.clientX - rect.left;
          mouseRef.current.y = e.clientY - rect.top;
      }
  };

  const handleMouseLeave = () => {
      mouseRef.current.x = -9999;
      mouseRef.current.y = -9999;
  };

  return (
    <div 
        ref={containerRef} 
        className={`relative inline-block w-full ${className}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
    >
      {/* Hidden Text for Sizing & Accessibility */}
      <div className="invisible whitespace-pre-line leading-relaxed pointer-events-none select-none" aria-hidden="true">
        {text}
      </div>
      
      {/* Canvas Layer */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 block w-full h-full pointer-events-auto"
        aria-label={text}
      />
    </div>
  );
};
