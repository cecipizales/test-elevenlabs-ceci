import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  amplitude: number; // 0 to 1
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, amplitude }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bars: number[] = Array(12).fill(2);

    const render = () => {
      // Vintage Amber Glow Background
      ctx.fillStyle = '#1a120b'; // Very dark amber/brown
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Update bars
      bars = bars.map((h, i) => {
        const noise = Math.random() * 2;
        const wave = Math.sin(Date.now() / 150 + i) * 3;
        const target = isActive 
          ? 5 + Math.random() * (amplitude * 60) + wave
          : 2;
        return h + (target - h) * 0.2; 
      });

      const barWidth = 12;
      const gap = 4;
      const totalWidth = bars.length * (barWidth + gap);
      const startX = centerX - totalWidth / 2;

      bars.forEach((h, i) => {
        const x = startX + i * (barWidth + gap);
        const height = Math.max(2, h);
        
        // LED Segment effect
        const numSegments = Math.floor(height / 4);
        for(let s=0; s<numSegments; s++) {
             // Bottom up
             const y = centerY + 20 - (s * 4);
             
             // Color based on height (Green -> Amber -> Red)
             if (s < 5) ctx.fillStyle = '#d97706'; // Amber
             else ctx.fillStyle = '#f59e0b'; // Light Amber

             ctx.fillRect(x, y, barWidth, 3);
        }
      });
      
      // Screen glare/scanline
      ctx.fillStyle = 'rgba(255, 200, 100, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, amplitude]);

  return (
    <canvas 
      ref={canvasRef} 
      width={240} 
      height={80} 
      className="w-full h-full object-contain rounded-md border border-amber-900/50 shadow-inner bg-black"
    />
  );
};

export default Visualizer;