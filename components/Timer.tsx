import React, { useEffect } from 'react';
import { TimerState } from '../types';
import { Play, Square } from 'lucide-react';

interface TimerProps {
  timerState: TimerState;
  setTimerState: React.Dispatch<React.SetStateAction<TimerState>>;
}

const Timer: React.FC<TimerProps> = ({ timerState, setTimerState }) => {
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (timerState.isActive && timerState.timeLeft > 0) {
      interval = setInterval(() => {
        setTimerState((prev) => ({
          ...prev,
          timeLeft: prev.timeLeft - 1,
        }));
      }, 1000);
    } else if (timerState.timeLeft === 0 && timerState.isActive) {
      // Timer finished
      setTimerState((prev) => ({ ...prev, isActive: false }));
      // Optional: Play a sound or trigger global alert
    }
    return () => clearInterval(interval);
  }, [timerState.isActive, timerState.timeLeft, setTimerState]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const progress = timerState.duration > 0 
    ? ((timerState.duration - timerState.timeLeft) / timerState.duration) * 100 
    : 0;

  return (
    <div className="bg-studio-800 rounded-2xl p-6 border border-studio-700 flex flex-col items-center justify-center relative overflow-hidden">
      {/* Progress Background */}
      <div 
        className="absolute bottom-0 left-0 h-1 bg-accent transition-all duration-1000 ease-linear"
        style={{ width: `${progress}%` }}
      />
      
      <div className="text-center z-10">
        <div className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-2">
            {timerState.isActive ? 'On Air • Focus Session' : 'Standby'}
        </div>
        <div className="text-6xl font-mono font-medium text-white tracking-tighter tabular-nums mb-4">
          {formatTime(timerState.timeLeft)}
        </div>
        
        <div className="flex space-x-4 justify-center">
            {!timerState.isActive && timerState.timeLeft < timerState.duration && (
                <button 
                    onClick={() => setTimerState(prev => ({ ...prev, isActive: true }))}
                    className="flex items-center space-x-2 px-4 py-2 bg-studio-700 hover:bg-studio-600 rounded-full text-sm font-medium transition"
                >
                    <Play size={14} /> <span>Resume</span>
                </button>
            )}
            
            {timerState.isActive && (
                 <button 
                 onClick={() => setTimerState(prev => ({ ...prev, isActive: false }))}
                 className="flex items-center space-x-2 px-4 py-2 bg-studio-700 hover:bg-studio-600 rounded-full text-sm font-medium transition"
             >
                 <Square size={14} /> <span>Pause</span>
             </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default Timer;