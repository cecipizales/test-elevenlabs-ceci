import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';
import { ElevenLabsConfig } from '../types';
import { ElevenLabsClient } from '../utils/elevenLabs';

// Tools definitions
const toolsDefinition = [
  {
    functionDeclarations: [
      {
        name: 'startTimer',
        description: 'Start a focus timer for a specified duration in minutes.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            minutes: { type: Type.NUMBER, description: 'Duration in minutes' },
          },
          required: ['minutes'],
        },
      },
      {
        name: 'stopTimer',
        description: 'Stop the current focus timer.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'setMusicStyle',
        description: 'Change the generative music style/genre. Supported: lofi, rock, techno, classical, ambient.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            style: { type: Type.STRING, description: 'The genre or style to switch to.' },
          },
          required: ['style'],
        },
      },
      {
        name: 'stopMusic',
        description: 'Stop or pause the music.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
      {
        name: 'addTask',
        description: 'Add a new task to the list.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                task: { type: Type.STRING, description: 'The task description' }
            },
            required: ['task']
        }
      },
      {
        name: 'getNews',
        description: 'Get a short news update or headlines about a specific topic or general world news.',
        parameters: {
            type: Type.OBJECT,
            properties: {
                topic: { type: Type.STRING, description: 'The news topic or "general" for headlines.' }
            },
            required: ['topic']
        }
      }
    ],
  },
];

export class GeminiLiveService {
  private ai: GoogleGenAI;
  private inputAudioContext: AudioContext | null = null;
  private outputAudioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private mediaStream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sessionPromise: Promise<any> | null = null; 
  private isMicMuted: boolean = true;
  private lastCallTime: number = 0;
  private duckingTimeout: number | null = null;
  
  // ElevenLabs
  private elConfig: ElevenLabsConfig | null = null;
  private elClient: ElevenLabsClient | null = null;
  private transcriptBuffer: string = "";
  
  // Callbacks
  public onAudioData: ((amplitude: number) => void) | null = null;
  public onTranscript: ((text: string, isUser: boolean) => void) | null = null;
  public onToolCall: ((name: string, args: any) => Promise<any>) | null = null;
  public onError: ((error: Error) => void) | null = null;
  public onSpeakerActivity: ((active: boolean, source: 'ai' | 'user') => void) | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(locationInfo: string, elConfig?: ElevenLabsConfig) {
    this.elConfig = elConfig || null;
    
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    if (this.elConfig && this.outputAudioContext) {
        this.elClient = new ElevenLabsClient(this.elConfig.apiKey, this.elConfig.voiceId, this.outputAudioContext);
    }

    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone access denied", err);
      throw new Error("Microphone access denied. Please enable permissions.");
    }

    const systemInstruction = `
      You are "Focus FM", a 24/7 vintage FM radio station.
      Current Context: ${locationInfo}.
      
      CORE PERSONA:
      - You are a friendly, warm, upbeat gay male radio host.
      - Voice: Smooth, resonant, welcoming, slightly theatrical but authentic.
      - Vibe: Late-night vintage radio warmth. You are always "live" on the air.
      
      MUSIC HANDLING:
      - The station creates its own generative music.
      - You control the synth using 'setMusicStyle'. 
      - Supported styles: Lofi, Rock, Techno, Classical, Ambient.
      - If user asks for music, change the style using the tool.
      - Never say you can't play music. You ARE the music controller.

      INTERACTION MODEL:
      - The user is a "Caller" calling into the station.
      - IMPORTANT: When you receive the text "[PHONE RINGS...]", you MUST act out answering the phone immediately.
      - Example Answer: "Focus FM, you're live on the air! Who am I speaking with?"
      - Be snappy. Don't wait.
      
      RULES:
      - Keep responses snappy and radio-friendly.
      - Never break character. You are NOT an AI assistant. You are a Radio Host.
    `;

    const config: any = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
      },
      systemInstruction,
      tools: toolsDefinition,
      inputAudioTranscription: {}, 
    };

    if (this.elConfig) {
        config.outputAudioTranscription = { model: "gemini-2.5-flash" }; 
    }

    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config,
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Connected");
          try {
             this.startAudioInput();
          } catch (e) {
             console.error("Failed to start audio input", e);
             if (this.onError) this.onError(new Error("Audio input failed"));
          }
        },
        onmessage: this.handleMessage.bind(this),
        onclose: () => console.log("Gemini Live Closed"),
        onerror: (err) => {
            console.error("Gemini Live Error", err);
            if (this.onError) this.onError(new Error("Connection error"));
        },
      },
    });

    await this.sessionPromise;
  }
  
  public resumeAudio() {
      if (this.inputAudioContext?.state === 'suspended') this.inputAudioContext.resume();
      if (this.outputAudioContext?.state === 'suspended') this.outputAudioContext.resume();
  }

  public setMicMuted(muted: boolean) {
      this.isMicMuted = muted;
      if (muted && this.onAudioData) this.onAudioData(0);
  }

  public startCall() {
      this.triggerRing();
      this.setMicMuted(false);
  }

  private triggerRing() {
      if (this.sessionPromise) {
          this.sendText("RING RING! [PHONE RINGS - PICK UP IMMEDIATELY AND SAY HELLO]");
      }
  }

  public endCall() {
      this.setMicMuted(true);
  }

  private startAudioInput() {
    if (!this.inputAudioContext || !this.mediaStream || !this.sessionPromise) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isMicMuted) {
          const inputData = e.inputBuffer.getChannelData(0);
          
          let sum = 0;
          for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
          const avg = sum / inputData.length;
          
          if (this.onAudioData) this.onAudioData(avg);

          if (avg > 0.01) {
             if (this.onSpeakerActivity) this.onSpeakerActivity(true, 'user');
          }

          const pcmBlob = createPcmBlob(inputData);
          this.sessionPromise?.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
          });
      } else {
          if (this.onAudioData) this.onAudioData(0);
      }
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  public async sendText(text: string) {
      if (!this.sessionPromise) return;
      this.sessionPromise.then(session => {
          session.sendRealtimeInput({
              content: [{ role: 'user', parts: [{ text }] }]
          });
      }).catch(err => console.error("Failed to send text:", err));
  }

  private async fetchNews(topic: string): Promise<string> {
      try {
        const result = await this.ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Find 3 short, recent news headlines about: ${topic}. Format as a radio script for a DJ to read quickly.`,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });
        return result.text || "No news found at the moment.";
      } catch (e) {
          console.error("News fetch failed", e);
          return "I couldn't grab the news wire right now. Let's get back to the music.";
      }
  }

  private async handleMessage(message: LiveServerMessage) {
    if (message.serverContent?.inputTranscription && this.onTranscript) {
      this.onTranscript(message.serverContent.inputTranscription.text, true);
    }
    
    if (this.elConfig && this.elClient) {
        if (message.serverContent?.outputTranscription?.text) {
             const textChunk = message.serverContent.outputTranscription.text;
             this.transcriptBuffer += textChunk;
             if (/[.!?]$/.test(this.transcriptBuffer.trim())) {
                 const sentence = this.transcriptBuffer;
                 this.transcriptBuffer = "";
                 this.playElevenLabsAudio(sentence);
             }
        }
        if (message.serverContent?.turnComplete && this.transcriptBuffer) {
             const sentence = this.transcriptBuffer;
             this.transcriptBuffer = "";
             this.playElevenLabsAudio(sentence);
        }

    } else {
        const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
        if (audioData && this.outputAudioContext) {
          this.scheduleAudioChunk(base64ToUint8Array(audioData));
        }
    }

    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        if (this.onToolCall) {
          try {
            let result;
            const args = fc.args as any;
            const name = fc.name as string;
            
            if (name === 'getNews') {
                result = await this.fetchNews(args.topic || 'general');
            } else {
                result = await this.onToolCall(name, args);
            }

            this.sessionPromise?.then(session => {
              session.sendToolResponse({
                functionResponses: {
                  id: fc.id,
                  name: name,
                  response: { result: result || "OK" } 
                }
              });
            });
          } catch (e) {
            console.error(`Error executing tool ${fc.name}`, e);
          }
        }
      }
    }
  }

  private async scheduleAudioChunk(pcmData: Uint8Array) {
      if (!this.outputAudioContext) return;
      const audioBuffer = await decodeAudioData(pcmData, this.outputAudioContext, 24000);
      this.playBuffer(audioBuffer);
  }

  private async playElevenLabsAudio(text: string) {
      if (!this.elClient) return;
      if (this.onSpeakerActivity) this.onSpeakerActivity(true, 'ai');
      
      const audioBuffer = await this.elClient.streamText(text);
      if (audioBuffer) {
          this.playBuffer(audioBuffer);
      } else {
          if (this.onSpeakerActivity) this.onSpeakerActivity(false, 'ai');
      }
  }

  private playBuffer(audioBuffer: AudioBuffer) {
      if (!this.outputAudioContext) return;

      if (this.onSpeakerActivity) this.onSpeakerActivity(true, 'ai');

      this.nextStartTime = Math.max(this.outputAudioContext.currentTime, this.nextStartTime);
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;

      if (this.duckingTimeout) window.clearTimeout(this.duckingTimeout);
      const timeRemaining = (this.nextStartTime - this.outputAudioContext.currentTime) * 1000;
      
      this.duckingTimeout = window.setTimeout(() => {
          if (this.onSpeakerActivity) this.onSpeakerActivity(false, 'ai');
      }, timeRemaining + 100);
  }

  disconnect() {
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    
    this.sessionPromise = null;
    this.inputAudioContext = null;
    this.outputAudioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.source = null;
    this.elClient = null;
  }
}