import { Blob } from '@google/genai';

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

export function createPcmBlob(data: Float32Array): Blob {
  const int16 = float32ToInt16(data);
  return {
    data: arrayBufferToBase64(int16.buffer),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number = 24000,
  numChannels: number = 1
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  // Create buffer with specific sample rate. Browser handles playback resampling.
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class AudioSynthesizer {
  public ctx: AudioContext;
  
  constructor() {
    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  playStaticNoise(duration: number, fadeOut = true) {
    const bufferSize = this.ctx.sampleRate * duration;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.05, this.ctx.currentTime);
    if (fadeOut) {
        gainNode.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
    }

    noise.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    noise.start();
  }

  playDTMFSequence() {
      const now = this.ctx.currentTime;
      // 4 tones - Normal dialing speed
      const tones = [
          [697, 1209], // 1
          [697, 1477], // 3
          [770, 1336], // 5
          [852, 1477]  // 9
      ];
      
      tones.forEach((freqs, i) => {
          const osc1 = this.ctx.createOscillator();
          const osc2 = this.ctx.createOscillator();
          const gain = this.ctx.createGain();
          
          osc1.type = 'sine';
          osc2.type = 'sine';
          osc1.frequency.value = freqs[0];
          osc2.frequency.value = freqs[1];
          
          const startTime = now + (i * 0.15); // Normal sequence
          const duration = 0.1; 
          
          gain.gain.setValueAtTime(0.1, startTime);
          gain.gain.linearRampToValueAtTime(0, startTime + duration);
          
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(this.ctx.destination);
          
          osc1.start(startTime);
          osc2.start(startTime);
          osc1.stop(startTime + duration);
          osc2.stop(startTime + duration);
      });
  }

  playPhoneRing(delay = 0) {
    const o1 = this.ctx.createOscillator();
    const o2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    o1.type = 'sine';
    o2.type = 'sine';
    o1.frequency.value = 440;
    o2.frequency.value = 480;

    o1.connect(gain);
    o2.connect(gain);
    gain.connect(this.ctx.destination);

    const startTime = this.ctx.currentTime + delay;

    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 0.1);
    gain.gain.linearRampToValueAtTime(0.1, startTime + 1.8);
    gain.gain.linearRampToValueAtTime(0, startTime + 2.0); 

    o1.start(startTime);
    o2.start(startTime);
    o1.stop(startTime + 2.0);
    o2.stop(startTime + 2.0);

    return () => {
        try {
            o1.stop();
            o2.stop();
            gain.disconnect();
        } catch (e) {
            // ignore
        }
    };
  }

  playHourChime() {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.setValueAtTime(0, t + 0.1);
      
      osc.frequency.setValueAtTime(1760, t + 0.2);
      gain.gain.setValueAtTime(0.1, t + 0.2);
      gain.gain.setValueAtTime(0, t + 0.6);
      
      osc.start(t);
      osc.stop(t + 0.6);
  }
}

export interface SynthConfig {
  bpm: number;              
  waveform: OscillatorType; 
  filterFreq: number;       
  arpeggio: boolean;
  drums: boolean;
  notesDensity: number;     
}

export class LoFiSynth {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private isPlaying: boolean = false;
  private nextNoteTime: number = 0;
  private config: SynthConfig = {
    bpm: 60, // Slower default for chill vibes
    waveform: 'triangle',
    filterFreq: 600,
    arpeggio: false,
    drums: true,
    notesDensity: 0.7
  };
  private timerID: number | null = null;
  private lookahead = 25.0; 
  private scheduleAheadTime = 0.1; 
  public analyser: AnalyserNode;
  private autoChangeTimeout: number | null = null;
  private vinylSource: AudioBufferSourceNode | null = null;

  // Hybrid Mode (External Loop)
  private loopSource: AudioBufferSourceNode | null = null;
  private activeLoopBuffer: AudioBuffer | null = null;
  private isLoopMode: boolean = false;

  private transposeSteps: number = 0;
  private baseVolume: number = 0.3;
  private userVolume: number = 1.0; 
  private isDucking: boolean = false;

  private baseChords = [
    [261.63, 329.63, 392.00, 493.88], // Cmaj7
    [293.66, 349.23, 440.00, 523.25], // Dm7
    [349.23, 440.00, 523.25, 659.25], // Fmaj7
    [392.00, 493.88, 587.33, 698.46], // G7
    [220.00, 261.63, 329.63, 392.00], // Am7
    [196.00, 246.94, 293.66, 349.23], // G7 (Low)
    [329.63, 415.30, 493.88, 587.33], // E7
  ];

  constructor(ctx?: AudioContext) {
    this.ctx = ctx || new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.updateGain();
    this.masterGain.connect(this.ctx.destination);
    
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 64;
    this.masterGain.connect(this.analyser);
  }

  start() {
    if (this.isPlaying) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.isPlaying = true;
    
    if (this.isLoopMode && this.activeLoopBuffer) {
        this.startLoopPlayback(this.activeLoopBuffer);
    } else {
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
        this.startVinylCrackles();
        this.scheduleAutoChange();
    }
  }

  stop() {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
    if (this.autoChangeTimeout) window.clearTimeout(this.autoChangeTimeout);
    
    if (this.loopSource) {
        try { this.loopSource.stop(); } catch(e) {}
        this.loopSource = null;
    }

    if (this.vinylSource) {
        try { this.vinylSource.stop(); } catch(e) {}
        this.vinylSource = null;
    }

    this.masterGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1);
  }

  // --- External Loop Mode (ElevenLabs) ---
  setExternalLoop(buffer: AudioBuffer) {
      this.isLoopMode = true;
      this.activeLoopBuffer = buffer;

      // Stop internal synth stuff
      if (this.timerID) {
          window.clearTimeout(this.timerID);
          this.timerID = null;
      }
      if (this.autoChangeTimeout) {
          window.clearTimeout(this.autoChangeTimeout);
          this.autoChangeTimeout = null;
      }
      
      this.startLoopPlayback(buffer);
  }

  switchToInternalSynth() {
      this.isLoopMode = false;
      this.activeLoopBuffer = null;
      if (this.loopSource) {
          try { this.loopSource.stop(); } catch(e) {}
          this.loopSource = null;
      }
      
      if (this.isPlaying) {
          this.nextNoteTime = this.ctx.currentTime;
          this.scheduler();
          this.scheduleAutoChange();
      }
  }

  private startLoopPlayback(buffer: AudioBuffer) {
      if (!this.isPlaying) return;
      
      if (this.loopSource) {
          try { this.loopSource.stop(); } catch(e) {}
      }

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.masterGain);
      src.start();
      this.loopSource = src;
  }

  // --- Internal Synth Methods ---

  configure(params: Partial<SynthConfig>) {
      if (this.isLoopMode) this.switchToInternalSynth();

      this.config = { ...this.config, ...params };
      if (!this.config.bpm || this.config.bpm < 30) this.config.bpm = 60;
      if (!this.config.waveform) this.config.waveform = 'triangle';

      if (this.isPlaying && !this.isLoopMode) {
          if (this.timerID) window.clearTimeout(this.timerID);
          this.nextNoteTime = this.ctx.currentTime + 0.1; 
          this.scheduler();
      }
      this.transposeSteps = Math.floor(Math.random() * 12) - 5;
  }

  setMasterVolume(vol: number) {
      this.userVolume = Math.max(0, Math.min(1, vol));
      this.updateGain(0.1);
  }

  duck(active: boolean) {
      if (this.isDucking === active) return;
      this.isDucking = active;
      this.updateGain(0.8); 
  }

  private updateGain(rampTime: number = 0.1) {
      const target = this.baseVolume * this.userVolume * (this.isDucking ? 0.2 : 1.0);
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.linearRampToValueAtTime(target, t + rampTime);
  }

  changeSong() {
      if (this.isLoopMode) return; 

      this.transposeSteps = Math.floor(Math.random() * 12) - 5;
      const bpmShift = Math.random() * 10 - 5;
      const currentBpm = this.config.bpm || 60;
      this.config.bpm = Math.max(40, Math.min(120, currentBpm + bpmShift));
      
      this.scheduleAutoChange();
  }

  private scheduleAutoChange() {
      if (this.autoChangeTimeout) window.clearTimeout(this.autoChangeTimeout);
      const delay = (90 + Math.random() * 60) * 1000;
      this.autoChangeTimeout = window.setTimeout(() => this.changeSong(), delay);
  }

  private scheduler() {
    if (!this.isPlaying || this.isLoopMode) return;
    
    if (!this.config.bpm || this.config.bpm <= 0) {
        this.config.bpm = 60;
    }

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.nextNoteTime);
      const secondsPerBeat = 60.0 / this.config.bpm;
      this.nextNoteTime += secondsPerBeat;
    }
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  private transpose(freq: number): number {
      return freq * Math.pow(2, this.transposeSteps / 12);
  }

  private scheduleNote(time: number) {
    const rawChord = this.baseChords[Math.floor(Math.random() * this.baseChords.length)];
    const transposedChord = rawChord.map(f => this.transpose(f));
    this.playChord(transposedChord, time);

    if (this.config.drums) {
        const beatDuration = (60.0 / this.config.bpm);
        this.playKick(time);
        this.playSnare(time + beatDuration / 2);
        if (Math.random() > 0.5) {
             this.playHiHat(time + beatDuration / 4);
             this.playHiHat(time + (beatDuration * 3) / 4);
        }
    }
  }

  private playChord(freqs: number[], time: number) {
    const gain = this.ctx.createGain();
    const duration = (60.0 / this.config.bpm) * (this.config.arpeggio ? 0.25 : 4.0);
    
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.15, time + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.01, time + duration);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.config.filterFreq;

    gain.connect(filter);
    filter.connect(this.masterGain);

    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = this.config.waveform;
      osc.frequency.value = f;
      osc.detune.value = this.config.waveform === 'sine' ? 0 : (Math.random() * 10 - 5);
      
      const startT = this.config.arpeggio ? time + (i * 0.1) : time;
      
      osc.connect(gain);
      osc.start(startT);
      osc.stop(time + duration + 0.5);
    });
  }

  private playKick(time: number) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start(time);
    osc.stop(time + 0.5);
  }

  private playSnare(time: number) {
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0; i<data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1500;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
  }

  private playHiHat(time: number) {
    const bufferSize = this.ctx.sampleRate * 0.05;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6000;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start(time);
  }

  private startVinylCrackles() {
     if (this.vinylSource) return;
     const bufferSize = this.ctx.sampleRate * 5;
     const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
     const data = buffer.getChannelData(0);
     let lastOut = 0;
     for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; 
        if (Math.random() > 0.9995) data[i] += Math.random() * 0.5;
     }
     const noise = this.ctx.createBufferSource();
     noise.buffer = buffer;
     noise.loop = true;
     const gain = this.ctx.createGain();
     gain.gain.value = 0.1;
     noise.connect(gain);
     gain.connect(this.masterGain);
     noise.start();
     this.vinylSource = noise;
  }
}