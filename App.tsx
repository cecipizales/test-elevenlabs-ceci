import React, { useState, useEffect, useRef } from 'react';
import { ConnectionState, Task, TimerState, CallState, ElevenLabsConfig } from './types';
import { GeminiLiveService } from './services/geminiLiveService';
import { AudioSynthesizer, LoFiSynth } from './utils/audioUtils';
import Timer from './components/Timer';
import MusicPlayer from './components/MusicPlayer';
import Tasks from './components/Tasks';
import SettingsModal from './components/SettingsModal';
import TopicSuggestions from './components/TopicSuggestions';
import { Phone, Radio as RadioIcon, Volume2, Settings, Lightbulb } from 'lucide-react';
import clsx from 'clsx';

type AppView = 'landing' | 'tuning' | 'radio';

const App: React.FC = () => {
  const [view, setView] = useState<AppView>('landing');
  const [tuningFreq, setTuningFreq] = useState(87.5);
  
  // Radio State
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.DISCONNECTED);
  const [callState, setCallState] = useState<CallState>(CallState.IDLE);
  
  // App Logic State
  const [timerState, setTimerState] = useState<TimerState>({ isActive: false, timeLeft: 0, duration: 0, mode: 'focus' });
  const [isMusicPlaying, setIsMusicPlaying] = useState(false); 
  const [userVolume, setUserVolume] = useState(70);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [locationInfo, setLocationInfo] = useState<string>('Unknown Location');
  
  // Settings & Ideas
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isIdeasOpen, setIsIdeasOpen] = useState(false);
  const [elConfig, setElConfig] = useState<ElevenLabsConfig | null>(() => {
      const saved = localStorage.getItem('focus_fm_el_config');
      return saved ? JSON.parse(saved) : null;
  });

  const serviceRef = useRef<GeminiLiveService | null>(null);
  const audioFxRef = useRef<AudioSynthesizer | null>(null);
  const lofiSynthRef = useRef<LoFiSynth | null>(null);
  const chimeIntervalRef = useRef<number | null>(null);
  const phraseIntervalRef = useRef<number | null>(null);

  // Refs for state access in async callbacks/intervals to avoid stale closures
  const callStateRef = useRef(callState);
  const connectionStateRef = useRef(connectionState);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  // Initialize Geolocation
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (p) => setLocationInfo(`Lat: ${p.coords.latitude.toFixed(2)}, Lon: ${p.coords.longitude.toFixed(2)}`),
        () => setLocationInfo('Unknown Location')
      );
    }
  }, []);

  // Update Synth Volume
  useEffect(() => {
      if (lofiSynthRef.current) {
          lofiSynthRef.current.setMasterVolume(userVolume / 100);
      }
  }, [userVolume]);

  // Global Ducking Logic: If calling/talking/listening, lower the music
  useEffect(() => {
      if (lofiSynthRef.current) {
          const shouldDuck = callState !== CallState.IDLE;
          lofiSynthRef.current.duck(shouldDuck);
      }
  }, [callState]);

  const saveSettings = (config: ElevenLabsConfig | null) => {
      setElConfig(config);
      if (config) {
          localStorage.setItem('focus_fm_el_config', JSON.stringify(config));
      } else {
          localStorage.removeItem('focus_fm_el_config');
      }
      if (connectionState === ConnectionState.CONNECTED) {
          handleConnect(); 
      }
  };

  // --- Tuning Logic ---
  const startTuning = () => {
    audioFxRef.current = new AudioSynthesizer();
    lofiSynthRef.current = new LoFiSynth(audioFxRef.current.ctx);
    
    setView('tuning');
    audioFxRef.current.playStaticNoise(4.5); 
    
    const targetFreq = 101.5; 
    const duration = 4000;
    const start = Date.now();

    const animate = () => {
        const now = Date.now();
        const progress = Math.min((now - start) / duration, 1);
        const ease = 1 - Math.pow(1 - progress, 3);
        
        const current = 87.5 + (targetFreq - 87.5) * ease;
        setTuningFreq(current);

        if (progress < 1) {
            requestAnimationFrame(animate);
        } else {
            setTimeout(() => {
                setView('radio');
                handleConnect(); 
            }, 500);
        }
    };
    requestAnimationFrame(animate);
  };

  // --- Gemini Connection ---
  const handleConnect = async () => {
    setConnectionState(ConnectionState.CONNECTING);
    
    if (serviceRef.current) serviceRef.current.disconnect();
    const service = new GeminiLiveService();
    serviceRef.current = service;

    // Speaker Activity is now handled mainly for State, ducking is handled by useEffect on callState
    service.onSpeakerActivity = (active, source) => {
        if (source === 'ai') {
            if (active) {
                setCallState(CallState.AI_SPEAKING);
                service.setMicMuted(true); 
            } else {
                setCallState(CallState.REPLY_READY);
            }
        }
    };

    service.onToolCall = async (name, args) => {
      if (name === 'startTimer') {
        const min = args.minutes || 25;
        setTimerState({ isActive: true, duration: min*60, timeLeft: min*60, mode: 'focus' });
        return { success: true };
      }
      if (name === 'stopTimer') {
        setTimerState(prev => ({ ...prev, isActive: false }));
        return { success: true };
      }
      if (name === 'setMusicStyle') {
          const style = args.style || 'lofi';
          lofiSynthRef.current?.setMusicStyle(style);
          return { success: true };
      }
      if (name === 'stopMusic') {
          setIsMusicPlaying(false);
          lofiSynthRef.current?.stop();
          return { success: true };
      }
      if (name === 'addTask') {
          setTasks(p => [...p, { id: Date.now().toString(), text: args.task, completed: false }]);
          return { success: true };
      }
      return { success: false };
    };

    try {
        await service.connect(locationInfo, elConfig || undefined);
        setConnectionState(ConnectionState.CONNECTED);
        lofiSynthRef.current?.start();
        setIsMusicPlaying(true);
        setupLoops();
    } catch (err) {
        console.error(err);
        setConnectionState(ConnectionState.ERROR);
    }
  };

  const setupLoops = () => {
      if (chimeIntervalRef.current) clearInterval(chimeIntervalRef.current);
      chimeIntervalRef.current = window.setInterval(() => {
          const d = new Date();
          if (d.getMinutes() === 0 && d.getSeconds() === 0) {
              audioFxRef.current?.playHourChime();
          }
      }, 1000);

      if (phraseIntervalRef.current) clearInterval(phraseIntervalRef.current);
      phraseIntervalRef.current = window.setInterval(() => {
         // Using refs here ensures we don't capture stale state in the closure
         if (callStateRef.current === CallState.IDLE && connectionStateRef.current === ConnectionState.CONNECTED) {
             serviceRef.current?.sendText("Say a very short station ID phrase like 'You're listening to Focus FM' or 'Midnight vibes' over the music. Don't ask a question.");
         }
      }, 8 * 60 * 1000); 
  };

  // --- Main Interaction Button ---
  const handleMainButton = () => {
      serviceRef.current?.resumeAudio();
      if (audioFxRef.current?.ctx.state === 'suspended') audioFxRef.current.ctx.resume();

      if (connectionState !== ConnectionState.CONNECTED) return;

      if (callState === CallState.IDLE) {
          setCallState(CallState.DIALING);
          audioFxRef.current?.playPhoneRing();
          
          setTimeout(() => {
             // Use ref to check latest state to avoid TS narrowing error and stale closure
             if (callStateRef.current === CallState.DIALING) {
                 setCallState(CallState.IDLE);
             }
          }, 6000);

          setTimeout(() => {
              serviceRef.current?.startCall();
          }, 1500);

      } else if (callState === CallState.REPLY_READY) {
          setCallState(CallState.USER_SPEAKING);
          serviceRef.current?.setMicMuted(false);

      } else if (callState === CallState.USER_SPEAKING) {
          setCallState(CallState.REPLY_READY);
          serviceRef.current?.setMicMuted(true);

      } else {
          setCallState(CallState.IDLE);
          serviceRef.current?.endCall();
      }
  };

  // --- Views ---

  if (view === 'landing') {
      return (
          <div className="min-h-screen bg-[#1a120b] flex flex-col items-center justify-center p-6 text-amber-500 font-mono">
              <div className="max-w-md text-center space-y-8">
                  <div className="w-24 h-24 border-4 border-amber-500 rounded-full mx-auto flex items-center justify-center animate-pulse-slow">
                      <RadioIcon size={48} />
                  </div>
                  <h1 className="text-4xl font-bold tracking-tighter">FOCUS FM</h1>
                  <p className="text-amber-500/60 uppercase tracking-widest text-sm">Analog Focus Radio</p>
                  <button 
                    onClick={startTuning}
                    className="px-8 py-4 border-2 border-amber-500 hover:bg-amber-500 hover:text-[#1a120b] transition-all uppercase font-bold tracking-widest text-sm"
                  >
                      Synchronize Radio
                  </button>
              </div>
          </div>
      );
  }

  if (view === 'tuning') {
      return (
          <div className="min-h-screen bg-[#1a120b] flex flex-col items-center justify-center p-6 relative overflow-hidden">
               <div className="w-full max-w-2xl h-32 relative border-b-2 border-amber-500/30 flex items-end pb-2">
                   <div className="absolute inset-0 flex justify-between items-end px-4 opacity-50">
                       {[88, 92, 96, 100, 104, 108].map(f => (
                           <div key={f} className="flex flex-col items-center">
                               <div className="h-4 w-0.5 bg-amber-500 mb-2"></div>
                               <span className="text-amber-500 font-mono text-xs">{f}</span>
                           </div>
                       ))}
                   </div>
                   <div 
                        className="absolute h-full w-1 bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.8)] transition-all duration-75 ease-linear z-10 top-0"
                        style={{ left: `${((tuningFreq - 87.5) / (108 - 87.5)) * 100}%` }}
                   ></div>
               </div>
               <div className="mt-8 font-mono text-amber-500 text-2xl animate-pulse">
                   TUNING... {tuningFreq.toFixed(1)} MHz
               </div>
          </div>
      );
  }

  return (
    <div className="min-h-screen bg-[#0f0a06] flex items-center justify-center p-4 md:p-8 font-sans">
      <SettingsModal 
        isOpen={isSettingsOpen} 
        onClose={() => setIsSettingsOpen(false)} 
        config={elConfig}
        onSave={saveSettings}
      />
      
      <TopicSuggestions 
        isOpen={isIdeasOpen}
        onClose={() => setIsIdeasOpen(false)}
      />

      <div className="w-full max-w-3xl bg-[#2a1b12] rounded-3xl p-4 md:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.8)] border-t border-white/10 relative">
          <div className="absolute inset-0 rounded-3xl opacity-20 pointer-events-none" 
               style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/wood-pattern.png")' }}></div>

          <div className="bg-[#1a120b] rounded-xl border-4 border-[#3d291a] p-6 flex flex-col gap-6 relative shadow-inner">
              
              {/* Top Panel */}
              <div className="flex justify-between items-center bg-black/40 p-4 rounded-lg border border-white/5 shadow-inner">
                   <div className="flex-1 h-2 flex gap-1 opacity-30">
                       {Array(20).fill(0).map((_, i) => <div key={i} className="w-1 h-full bg-black rounded-full"></div>)}
                   </div>
                   <div className="w-64 h-12 bg-[#100c08] border border-amber-900/50 relative overflow-hidden mx-4 rounded flex items-center px-4">
                        <div className="absolute left-0 w-full h-px bg-amber-500/20 top-1/2"></div>
                        <div className="w-1 h-full bg-red-500/80 shadow-[0_0_10px_red] absolute left-[70%]"></div>
                        <div className="w-full flex justify-between text-[10px] text-amber-500/50 font-mono relative z-10">
                            <span>98</span><span>100</span><span className="text-amber-500 font-bold glow">101.5</span><span>104</span>
                        </div>
                   </div>
                   <div className="flex-1 h-2 flex gap-1 opacity-30 justify-end">
                       {Array(20).fill(0).map((_, i) => <div key={i} className="w-1 h-full bg-black rounded-full"></div>)}
                   </div>
              </div>

              {/* Main Interface */}
              <div className="flex flex-col md:flex-row gap-6">
                  
                  {/* Left Controls */}
                  <div className="flex-1 flex flex-col justify-between space-y-4">
                      <div className="bg-black border-2 border-amber-900/50 rounded-lg h-48 relative overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,1)]">
                          <div className="absolute inset-0 z-20">
                              <MusicPlayer 
                                  isPlaying={isMusicPlaying} 
                                  synthAnalyser={lofiSynthRef.current?.analyser}
                              />
                          </div>
                          <div className="relative z-30 flex flex-col justify-between h-full p-4 pointer-events-none">
                                {timerState.isActive && (
                                    <div className="text-center absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm z-50">
                                        <div className="text-amber-500 font-mono text-4xl font-bold tracking-widest drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">
                                            {Math.floor(timerState.timeLeft / 60).toString().padStart(2,'0')}:
                                            {(timerState.timeLeft % 60).toString().padStart(2,'0')}
                                        </div>
                                        <div className="text-amber-500/60 text-[10px] uppercase tracking-widest">Focus Session</div>
                                    </div>
                                )}
                                {tasks.length > 0 && (
                                    <div className="absolute bottom-2 right-2 text-amber-500/50 text-[10px] font-mono text-right bg-black/50 px-2 rounded">
                                        TASKS: {tasks.filter(t => !t.completed).length}
                                    </div>
                                )}
                          </div>
                      </div>
                      
                      {/* Volume Slider */}
                      <div className="flex items-center space-x-3 bg-black/20 p-3 rounded-lg border border-white/5">
                          <Volume2 className="text-amber-700" size={16} />
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            value={userVolume}
                            onChange={(e) => setUserVolume(Number(e.target.value))}
                            className="w-full accent-amber-600 h-1 bg-amber-900/30 rounded-lg appearance-none cursor-pointer"
                          />
                      </div>
                  </div>

                  {/* Right Controls */}
                  <div className="w-full md:w-48 flex flex-col items-center justify-center gap-6 p-4 bg-[#231710] rounded-lg border border-white/5 shadow-inner relative">
                      
                      {/* Top Buttons */}
                      <div className="absolute top-2 right-2 flex gap-2">
                        <button 
                            onClick={() => setIsIdeasOpen(true)}
                            className="text-amber-900 hover:text-amber-600 transition-colors"
                            title="Ideas to say"
                        >
                            <Lightbulb size={16} />
                        </button>
                        <button 
                            onClick={() => setIsSettingsOpen(true)}
                            className="text-amber-900 hover:text-amber-600 transition-colors"
                            title="Settings"
                        >
                            <Settings size={16} />
                        </button>
                      </div>

                      <div className="relative group">
                          <button 
                             onClick={handleMainButton}
                             disabled={connectionState === ConnectionState.CONNECTING}
                             className={clsx(
                                 "w-24 h-24 rounded-full border-4 shadow-xl flex items-center justify-center transition-all duration-300 active:scale-95 relative overflow-hidden",
                                 (callState === CallState.IDLE || callState === CallState.REPLY_READY)
                                    ? "bg-[#1a120b] border-[#3d291a] hover:border-amber-700"
                                    : "bg-amber-500 border-amber-300 shadow-[0_0_30px_rgba(245,158,11,0.4)]"
                             )}
                          >
                              {connectionState === ConnectionState.CONNECTING && (
                                  <div className="absolute inset-0 bg-amber-500/20 animate-pulse flex items-center justify-center text-[10px] font-bold">INIT...</div>
                              )}
                              
                              <Phone size={32} className={clsx("transition-colors relative z-10", 
                                  callState !== CallState.IDLE && callState !== CallState.REPLY_READY ? "text-black fill-current" : "text-amber-700"
                              )} />
                          </button>
                          
                          <div className={clsx(
                              "absolute -top-2 -right-2 w-4 h-4 rounded-full border border-black transition-all duration-500",
                              callState !== CallState.IDLE ? "bg-red-500 shadow-[0_0_10px_red]" : "bg-black"
                          )}></div>
                      </div>

                      <div className="text-center space-y-1">
                          <div className="text-amber-700 font-bold uppercase tracking-widest text-xs">
                              {callState === CallState.IDLE ? 'Call Station' : 
                               callState === CallState.DIALING ? 'Dialing...' :
                               callState === CallState.AI_SPEAKING ? 'On Air (Listening)' :
                               callState === CallState.REPLY_READY ? 'Line Open' : 'On Air (Speaking)'}
                          </div>
                          <div className="text-amber-900/40 text-[10px] font-mono">
                              {callState === CallState.REPLY_READY ? 'PRESS TO REPLY' : 'PUSH TO TALK'}
                          </div>
                      </div>
                  </div>
              </div>
              
              <div className="flex justify-between items-center pt-2 border-t border-white/5">
                   <div className="text-amber-900/60 text-[10px] font-mono uppercase">
                       {elConfig ? 'ELEVENLABS VOICE ACTIVE' : 'BROADCAST LIVE'} • {tuningFreq.toFixed(1)} MHz
                   </div>
                   <div className="text-amber-900 text-[10px] font-mono uppercase">
                       {locationInfo}
                   </div>
              </div>
          </div>
      </div>
    </div>
  );
};

export default App;