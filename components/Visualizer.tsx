import React, { useEffect, useRef } from 'react';

interface VisualizerProps {
  isActive: boolean;
  amplitude: number; // 0 to 1
}

const Visualizer: React.FC<VisualizerProps> = ({ isActive, amplitude }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bars: number[] = Array(20).fill(10); // Initial heights

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      // Base style
      ctx.fillStyle = isActive ? '#ff5c00' : '#3f3f46';
      
      const barWidth = 6;
      const gap = 4;
      const totalWidth = bars.length * (barWidth + gap);
      const startX = centerX - totalWidth / 2;

      // Update bars based on amplitude
      // Create a wave effect
      bars = bars.map((h, i) => {
        const target = isActive 
          ? 10 + Math.random() * (amplitude * 100) + Math.sin(Date.now() / 100 + i) * 10 
          : 4;
        return h + (target - h) * 0.2; // Smooth transition
      });

      bars.forEach((h, i) => {
        const x = startX + i * (barWidth + gap);
        // Draw mirrored bars
        const height = Math.max(4, h);
        
        // Top half
        ctx.fillRect(x, centerY - height / 2, barWidth, height);
      });

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
      width={300} 
      height={100} 
      className="w-full h-24 object-contain"
    />
  );
};

export default Visualizer;