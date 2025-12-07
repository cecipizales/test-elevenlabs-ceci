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

// Convert Float32 audio data (Web Audio API standard) to PCM Int16 (Gemini requirement)
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
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Audio Effects & Generative Music ---

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

  playPhoneRing() {
    // Short, single ring for snappy pickup
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

    gain.gain.setValueAtTime(0, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.1);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 1.5);

    o1.start();
    o2.start();
    o1.stop(this.ctx.currentTime + 1.5);
    o2.stop(this.ctx.currentTime + 1.5);
  }

  playHourChime() {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      
      // Beep 1
      osc.frequency.setValueAtTime(880, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.setValueAtTime(0, t + 0.1);
      
      // Beep 2 (High)
      osc.frequency.setValueAtTime(1760, t + 0.2);
      gain.gain.setValueAtTime(0.1, t + 0.2);
      gain.gain.setValueAtTime(0, t + 0.6);
      
      osc.start(t);
      osc.stop(t + 0.6);
  }

  playClick() {
     const osc = this.ctx.createOscillator();
     const gain = this.ctx.createGain();
     osc.connect(gain);
     gain.connect(this.ctx.destination);
     
     osc.frequency.setValueAtTime(150, this.ctx.currentTime);
     gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
     gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
     
     osc.start();
     osc.stop(this.ctx.currentTime + 0.1);
  }
}

// --- Procedural Lo-Fi Engine ---

export class LoFiSynth {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private isPlaying: boolean = false;
  private nextNoteTime: number = 0;
  private style: string = 'lofi'; // lofi, rock, techno, classical, ambient
  private timerID: number | null = null;
  private lookahead = 25.0; 
  private scheduleAheadTime = 0.1; 
  public analyser: AnalyserNode;

  // Parameters
  private transposeSteps: number = 0;
  private baseVolume: number = 0.3;
  private userVolume: number = 1.0; 
  private isDucking: boolean = false;

  // Chords (Roots in Hz)
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
    this.nextNoteTime = this.ctx.currentTime;
    
    this.scheduler();
    this.startVinylCrackles();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerID) window.clearTimeout(this.timerID);
    this.masterGain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1);
  }

  setMusicStyle(style: string) {
    const s = style.toLowerCase();
    if (s.includes('rock')) this.style = 'rock';
    else if (s.includes('techno') || s.includes('house')) this.style = 'techno';
    else if (s.includes('classical') || s.includes('piano')) this.style = 'classical';
    else if (s.includes('ambient') || s.includes('focus')) this.style = 'ambient';
    else this.style = 'lofi';
    
    this.changeSong(); // Trigger immediate visual change
  }

  setMasterVolume(vol: number) {
      this.userVolume = Math.max(0, Math.min(1, vol));
      this.updateGain(0.1);
  }

  duck(active: boolean) {
      if (this.isDucking === active) return;
      this.isDucking = active;
      this.updateGain(0.8); // Slower ramp for ducking
  }

  private updateGain(rampTime: number = 0.1) {
      const target = this.baseVolume * this.userVolume * (this.isDucking ? 0.2 : 1.0);
      const t = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(t);
      this.masterGain.gain.linearRampToValueAtTime(target, t + rampTime);
  }

  changeSong() {
      // Just change key/params immediately, no pause
      this.transposeSteps = Math.floor(Math.random() * 12) - 5;
  }

  private scheduler() {
    if (!this.isPlaying) return;

    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      this.scheduleNote(this.nextNoteTime);
      this.nextNoteTime += this.getNoteDuration();
    }
    this.timerID = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  private getNoteDuration() {
    switch (this.style) {
      case 'techno': return 0.4; // Fast
      case 'rock': return 1.0; 
      case 'classical': return 1.5;
      case 'ambient': return 4.0;
      case 'lofi': default: return 3.0;
    }
  }

  private transpose(freq: number): number {
      return freq * Math.pow(2, this.transposeSteps / 12);
  }

  private scheduleNote(time: number) {
    // 1. CHORDS / MELODY
    const rawChord = this.baseChords[Math.floor(Math.random() * this.baseChords.length)];
    const transposedChord = rawChord.map(f => this.transpose(f));
    this.playChord(transposedChord, time);

    // 2. DRUMS
    const beatTime = this.getNoteDuration() / 4;
    
    // Kick
    if (this.style === 'techno') {
        // 4 on the floor
        for(let i=0; i<4; i++) this.playKick(time + beatTime * i);
    } else if (this.style === 'rock') {
        this.playKick(time);
        this.playKick(time + beatTime * 2.5);
    } else if (this.style === 'ambient') {
        // Sparse kick
        if (Math.random() > 0.5) this.playKick(time);
    } else {
        // Lofi standard
        this.playKick(time);
    }
    
    // Snare/Clap
    if (this.style === 'techno') {
        this.playSnare(time + beatTime); // Offbeat
        this.playSnare(time + beatTime * 3);
    } else if (this.style !== 'ambient' && this.style !== 'classical') {
        this.playSnare(time + beatTime * 2);
    }
    
    // HiHats
    if (this.style !== 'classical') {
        const subdivs = this.style === 'techno' ? 8 : 4;
        const hatTime = this.getNoteDuration() / subdivs;
        for(let i=0; i<subdivs; i++) {
            if (Math.random() > 0.3) {
                this.playHiHat(time + hatTime * i + (Math.random() * 0.02)); 
            }
        }
    }
  }

  private playChord(freqs: number[], time: number) {
    const gain = this.ctx.createGain();
    const duration = this.getNoteDuration();
    
    // Envelope
    gain.gain.setValueAtTime(0, time);
    if (this.style === 'rock') {
        gain.gain.linearRampToValueAtTime(0.2, time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration * 0.5);
    } else if (this.style === 'classical') {
        // Arpeggio feel - play notes staggered
        // But for simplicity in this function, just softer attack
        gain.gain.linearRampToValueAtTime(0.15, time + 0.5);
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
    } else {
        gain.gain.linearRampToValueAtTime(0.15, time + 0.5); 
        gain.gain.exponentialRampToValueAtTime(0.01, time + duration); 
    }

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = this.style === 'rock' ? 2000 : (this.style === 'techno' ? 3000 : 800);

    gain.connect(filter);
    filter.connect(this.masterGain);

    freqs.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      
      // Osc Types per Genre
      if (this.style === 'rock') osc.type = 'sawtooth';
      else if (this.style === 'techno') osc.type = 'square';
      else if (this.style === 'classical') osc.type = 'sine';
      else osc.type = 'triangle'; // Lofi/Ambient

      osc.frequency.value = f;
      // Slight detune
      osc.detune.value = Math.random() * 10 - 5; 
      
      // Stagger classical notes
      const startT = this.style === 'classical' ? time + (i * 0.1) : time;
      
      osc.connect(gain);
      osc.start(startT);
      osc.stop(time + duration);
    });
  }

  private playKick(time: number) {
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    const freqStart = this.style === 'techno' ? 100 : (150 + (this.transposeSteps * 2));
    const decay = this.style === 'techno' ? 0.3 : 0.5;

    osc.frequency.setValueAtTime(freqStart, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + decay);
    
    gain.gain.setValueAtTime(0.8, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + decay);

    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start(time);
    osc.stop(time + decay);
  }

  private playSnare(time: number) {
    const noise = this.ctx.createBufferSource();
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.2, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0; i<data.length; i++) data[i] = Math.random() * 2 - 1;
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = this.style === 'rock' ? 2000 : 1500;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, time);
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
     const bufferSize = this.ctx.sampleRate * 5;
     const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
     const data = buffer.getChannelData(0);
     
     // Simple brown noise approx
     let lastOut = 0;
     for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        data[i] = (lastOut + (0.02 * white)) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5; 
        
        // Occasional Pop
        if (Math.random() > 0.9995) {
            data[i] += Math.random() * 0.5;
        }
     }

     const noise = this.ctx.createBufferSource();
     noise.buffer = buffer;
     noise.loop = true;
     
     const gain = this.ctx.createGain();
     gain.gain.value = 0.1;
     
     noise.connect(gain);
     gain.connect(this.masterGain);
     noise.start();
  }
}