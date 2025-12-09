import React, { useEffect, useRef } from 'react';

interface MusicPlayerProps {
  isPlaying: boolean;
  synthAnalyser?: AnalyserNode;
  generationStatus?: 'idle' | 'generating' | 'error';
}

const MusicPlayer: React.FC<MusicPlayerProps> = ({ isPlaying, synthAnalyser, generationStatus = 'idle' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dataArray: Uint8Array;
    if (synthAnalyser) {
       dataArray = new Uint8Array(synthAnalyser.frequencyBinCount);
    }

    const render = () => {
      // Clear with CRT effect bg
      ctx.fillStyle = '#050505'; 
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Draw Grid
      ctx.strokeStyle = '#331a00';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for(let i=0; i<canvas.width; i+=20) { ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); }
      for(let i=0; i<canvas.height; i+=20) { ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); }
      ctx.stroke();

      if (generationStatus === 'generating') {
          // FLASHING LOADING TEXT
          const t = Date.now();
          if (Math.floor(t / 500) % 2 === 0) {
              ctx.font = '14px "JetBrains Mono"';
              ctx.fillStyle = '#f59e0b'; // Bright Amber
              ctx.textAlign = 'center';
              ctx.fillText("GENERATING TAPE...", canvas.width/2, canvas.height/2);
          }
      } else if (generationStatus === 'error') {
          // ERROR TEXT
          ctx.font = '14px "JetBrains Mono"';
          ctx.fillStyle = '#ef4444'; // Red
          ctx.textAlign = 'center';
          ctx.fillText("TAPE ERROR", canvas.width/2, canvas.height/2);
          ctx.font = '10px "JetBrains Mono"';
          ctx.fillText("USING BACKUP SYNTH", canvas.width/2, canvas.height/2 + 15);
      } else if (isPlaying && synthAnalyser) {
          synthAnalyser.getByteFrequencyData(dataArray);
          
          const barWidth = (canvas.width / dataArray.length) * 2.5;
          let barHeight;
          let x = 0;

          for(let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2;
            
            // Retro Amber Color
            ctx.fillStyle = `rgb(${barHeight + 100}, 100, 0)`;
            ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
          }
      } else if (isPlaying) {
          // Simulation if analyser fails
          const t = Date.now();
          ctx.fillStyle = '#d97706';
          for(let i=0; i<10; i++) {
              const h = Math.sin(t/200 + i) * 20 + 30;
              ctx.fillRect(i * 30 + 10, canvas.height - h, 20, h);
          }
      } else {
          // Paused Text
          ctx.font = '12px "JetBrains Mono"';
          ctx.fillStyle = '#d97706';
          ctx.textAlign = 'center';
          ctx.fillText("SYNTH OFFLINE", canvas.width/2, canvas.height/2);
      }

      // Scanline
      ctx.fillStyle = "rgba(255, 150, 0, 0.03)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      animationRef.current = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationRef.current);
  }, [isPlaying, synthAnalyser, generationStatus]);

  return (
    <div className="w-full h-full bg-black relative">
       <div className="absolute top-2 left-2 z-10 text-[10px] text-amber-500/60 font-mono tracking-widest bg-black/50 px-1">
          GENERATIVE FM SYNTH
       </div>
       <canvas 
         ref={canvasRef} 
         width={300} 
         height={192} 
         className="w-full h-full object-cover"
       />
    </div>
  );
};

export default MusicPlayer;