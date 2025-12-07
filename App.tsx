import React, { useState, useEffect, useRef } from 'react';
import { ConnectionState, MusicGenre, Task, TimerState } from './types';
import { GeminiLiveService } from './services/geminiLiveService';
import Visualizer from './components/Visualizer';
import Timer from './components/Timer';
import MusicPlayer from './components/MusicPlayer';
import Tasks from './components/Tasks';
import { Mic, MicOff, Radio, Power } from 'lucide-react';
import clsx from 'clsx';

const App: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [amplitude, setAmplitude] = useState(0);
  const [lastTranscript, setLastTranscript] = useState<string>('');
  
  // App State controlled by AI or User
  const [timerState, setTimerState] = useState<TimerState>({
    isActive: false,
    timeLeft: 0,
    duration: 0,
    mode: 'focus'
  });
  const [musicGenre, setMusicGenre] = useState<MusicGenre>(MusicGenre.NONE);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [locationInfo, setLocationInfo] = useState<string>('Unknown Location');
  
  const serviceRef = useRef<GeminiLiveService | null>(null);

  // Initialize Geolocation on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
            // Reverse geocoding could be done here, but for simplicity we send lat/long 
            // and let the LLM infer context or just use browser time. 
            // Better: use a simple approximation or just the Timezone.
            const date = new Date();
            const timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            setLocationInfo(`Local Time: ${timeString}, Lat: ${position.coords.latitude.toFixed(2)}, Lon: ${position.coords.longitude.toFixed(2)}`);
        },
        () => {
             const date = new Date();
             setLocationInfo(`Local Time: ${date.toLocaleTimeString()}`);
        }
      );
    }
  }, []);

  const handleConnect = async () => {
    if (connectionState === ConnectionState.CONNECTED) {
      serviceRef.current?.disconnect();
      setConnectionState(ConnectionState.DISCONNECTED);
      setMusicGenre(MusicGenre.NONE);
      setIsMusicPlaying(false);
      return;
    }

    setConnectionState(ConnectionState.CONNECTING);
    
    const service = new GeminiLiveService();
    serviceRef.current = service;

    // Wiring up callbacks
    service.onAudioData = (amp) => setAmplitude(amp);
    
    service.onTranscript = (text, isUser) => {
        // We only show user transcripts for now to confirm input
        if(isUser) setLastTranscript(text);
    };

    service.onToolCall = async (name, args) => {
      console.log(`Tool called: ${name}`, args);
      
      if (name === 'startTimer') {
        const minutes = args.minutes || 25;
        const seconds = Math.floor(minutes * 60);
        setTimerState({
            isActive: true,
            duration: seconds,
            timeLeft: seconds,
            mode: 'focus'
        });
        return { success: true, message: `Started ${minutes} minute timer` };
      }
      
      if (name === 'stopTimer') {
        setTimerState(prev => ({ ...prev, isActive: false }));
        return { success: true, message: "Timer stopped" };
      }

      if (name === 'playMusic') {
        const genreMap: Record<string, MusicGenre> = {
            'lofi': MusicGenre.LOFI,
            'classical': MusicGenre.CLASSICAL,
            'jazz': MusicGenre.JAZZ,
            'ambient': MusicGenre.AMBIENT
        };
        const selected = genreMap[args.genre?.toLowerCase()] || MusicGenre.LOFI;
        setMusicGenre(selected);
        setIsMusicPlaying(true);
        return { success: true, message: `Playing ${selected}` };
      }

      if (name === 'stopMusic') {
        setIsMusicPlaying(false);
        return { success: true, message: "Music stopped" };
      }

      return { success: false, message: "Unknown tool" };
    };

    service.onError = (e) => {
        console.error(e);
        setConnectionState(ConnectionState.ERROR);
        alert(e.message);
    };

    await service.connect(locationInfo);
    setConnectionState(ConnectionState.CONNECTED);
  };

  return (
    <div className="min-h-screen bg-studio-900 text-white font-sans selection:bg-accent selection:text-white flex flex-col items-center p-4 md:p-8">
      
      {/* Header / Top Bar */}
      <header className="w-full max-w-5xl flex justify-between items-center mb-8">
        <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(255,92,0,0.5)]">
                <Radio className="text-white w-6 h-6" />
            </div>
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Focus FM</h1>
                <p className="text-xs text-gray-500 font-mono tracking-widest uppercase">Live AI Broadcast</p>
            </div>
        </div>

        <div className="flex items-center space-x-4">
             {/* Live Indicator */}
             <div className={clsx(
                 "flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border",
                 connectionState === ConnectionState.CONNECTED 
                    ? "border-red-500/50 bg-red-500/10 text-red-500 animate-pulse-slow"
                    : "border-gray-700 bg-gray-800 text-gray-500"
             )}>
                 <div className={clsx("w-2 h-2 rounded-full", connectionState === ConnectionState.CONNECTED ? "bg-red-500" : "bg-gray-500")} />
                 <span>{connectionState === ConnectionState.CONNECTED ? "On Air" : "Offline"}</span>
             </div>
        </div>
      </header>

      {/* Main Studio Dashboard */}
      <main className="w-full max-w-5xl grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Col: Main Controls & Visualizer */}
        <div className="md:col-span-7 flex flex-col gap-6">
            
            {/* The "Booth" */}
            <div className="bg-gradient-to-br from-studio-800 to-studio-900 border border-studio-700 rounded-3xl p-8 relative overflow-hidden min-h-[300px] flex flex-col justify-between shadow-2xl">
                
                {/* Visualizer Area */}
                <div className="flex-1 flex flex-col items-center justify-center space-y-4">
                    {connectionState === ConnectionState.DISCONNECTED ? (
                        <div className="text-center space-y-2">
                             <div className="w-16 h-16 bg-studio-700 rounded-full mx-auto flex items-center justify-center mb-4">
                                <Power className="w-8 h-8 text-gray-500" />
                             </div>
                             <p className="text-gray-400">Station is offline.</p>
                             <p className="text-sm text-gray-600">Click the power button to tune in.</p>
                        </div>
                    ) : (
                        <Visualizer isActive={connectionState === ConnectionState.CONNECTED} amplitude={amplitude} />
                    )}
                </div>

                {/* Transcript Ticker */}
                {lastTranscript && connectionState === ConnectionState.CONNECTED && (
                    <div className="bg-black/30 backdrop-blur-sm rounded-lg p-3 text-center border border-white/5 mt-4">
                        <p className="text-sm text-gray-300 italic">"{lastTranscript}"</p>
                    </div>
                )}
            </div>

            {/* Main Action Bar */}
            <div className="bg-studio-800 border border-studio-700 rounded-2xl p-4 flex items-center justify-between shadow-lg">
                <div className="flex items-center space-x-4">
                    <button 
                        onClick={handleConnect}
                        disabled={connectionState === ConnectionState.CONNECTING}
                        className={clsx(
                            "w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg hover:scale-105 active:scale-95",
                            connectionState === ConnectionState.CONNECTED 
                                ? "bg-red-500 hover:bg-red-600 shadow-red-500/20" 
                                : "bg-accent hover:bg-accent-glow shadow-accent/20"
                        )}
                    >
                        {connectionState === ConnectionState.CONNECTING ? (
                             <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : connectionState === ConnectionState.CONNECTED ? (
                            <Power className="w-8 h-8 text-white fill-current" />
                        ) : (
                            <Mic className="w-8 h-8 text-white fill-current" />
                        )}
                    </button>
                    <div>
                         <h3 className="font-bold text-white">
                             {connectionState === ConnectionState.CONNECTED ? "Broadcast Active" : "Start Broadcast"}
                         </h3>
                         <p className="text-xs text-gray-400">
                             {connectionState === ConnectionState.CONNECTED ? "Listening..." : "Tap to speak with Focus FM"}
                         </p>
                    </div>
                </div>

                {/* Status Icons */}
                <div className="flex space-x-2">
                     <div className={clsx("p-2 rounded-full", connectionState === ConnectionState.CONNECTED ? "bg-green-500/10 text-green-500" : "bg-studio-700 text-gray-500")}>
                        <Mic size={18} />
                     </div>
                </div>
            </div>

             <MusicPlayer genre={musicGenre} isPlaying={isMusicPlaying} />

        </div>

        {/* Right Col: Tools (Timer & Tasks) */}
        <div className="md:col-span-5 flex flex-col gap-6">
             <Timer timerState={timerState} setTimerState={setTimerState} />
             <div className="flex-1 min-h-[300px]">
                 <Tasks tasks={tasks} setTasks={setTasks} />
             </div>
        </div>

      </main>

      {/* Footer info */}
      <footer className="w-full max-w-5xl mt-12 text-center text-xs text-gray-600 border-t border-studio-800 pt-6">
           <p>Focus FM • AI Powered Productivity Radio</p>
      </footer>
    </div>
  );
};

export default App;