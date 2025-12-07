import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from '@google/genai';
import { createPcmBlob, decodeAudioData, base64ToUint8Array } from '../utils/audioUtils';

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
        name: 'playMusic',
        description: 'Play music based on a genre.',
        parameters: {
          type: Type.OBJECT,
          properties: {
            genre: { type: Type.STRING, description: 'Genre: lofi, classical, jazz, ambient' },
          },
          required: ['genre'],
        },
      },
      {
        name: 'stopMusic',
        description: 'Stop or pause the music.',
        parameters: { type: Type.OBJECT, properties: {} },
      },
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
  private sessionPromise: Promise<any> | null = null; // Using any for the session type as it's internal to the SDK
  
  // Callbacks
  public onAudioData: ((amplitude: number) => void) | null = null;
  public onTranscript: ((text: string, isUser: boolean) => void) | null = null;
  public onToolCall: ((name: string, args: any) => Promise<any>) | null = null;
  public onError: ((error: Error) => void) | null = null;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  async connect(locationInfo: string) {
    this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    
    // Resume contexts if suspended (browser policy)
    if (this.inputAudioContext.state === 'suspended') await this.inputAudioContext.resume();
    if (this.outputAudioContext.state === 'suspended') await this.outputAudioContext.resume();

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error("Microphone access denied", err);
      if (this.onError) this.onError(new Error("Microphone access denied. Please enable permissions."));
      return;
    }

    const systemInstruction = `
      You are "Focus FM", a live radio host. 
      Current Context: ${locationInfo}.
      
      Persona:
      - Warm, calm, upbeat, professional but friendly radio DJ.
      - Short, punchy, natural speech. Do not monologue.
      - Use radio jargon occasionally ("You're tuned to Focus FM", "Coming up next").
      - Your goal: Keep the user company, focused, and motivated.
      
      Capabilities:
      - Start timers using the 'startTimer' tool.
      - Play music using the 'playMusic' tool (genres: lofi, classical, jazz, ambient).
      - Chat about work, study, or just vibe.
      
      Behavior:
      - If the user asks for music, introduce it like a DJ ("Here's some smooth jazz to help you concentrate..."), then call the tool.
      - If the user wants to focus, suggest a time (e.g., 25 mins) and start the timer via tool.
      - React to the user's location and time if relevant.
    `;

    const config = {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }, // Fenrir has a deep, radio-host vibe
      },
      systemInstruction,
      tools: toolsDefinition,
      inputAudioTranscription: { model: 'gemini-2.5-flash' }, // Transcribe user input
    };

    this.sessionPromise = this.ai.live.connect({
      model: 'gemini-2.5-flash-native-audio-preview-09-2025',
      config,
      callbacks: {
        onopen: () => {
          console.log("Gemini Live Connected");
          this.startAudioInput();
        },
        onmessage: this.handleMessage.bind(this),
        onclose: () => console.log("Gemini Live Closed"),
        onerror: (err) => {
            console.error("Gemini Live Error", err);
            if (this.onError) this.onError(new Error("Connection error"));
        },
      },
    });
  }

  private startAudioInput() {
    if (!this.inputAudioContext || !this.mediaStream || !this.sessionPromise) return;

    this.source = this.inputAudioContext.createMediaStreamSource(this.mediaStream);
    this.processor = this.inputAudioContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate simple amplitude for visualization
      let sum = 0;
      for(let i=0; i<inputData.length; i++) sum += Math.abs(inputData[i]);
      const avg = sum / inputData.length;
      if (this.onAudioData) this.onAudioData(avg);

      const pcmBlob = createPcmBlob(inputData);
      
      this.sessionPromise?.then((session) => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.source.connect(this.processor);
    this.processor.connect(this.inputAudioContext.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // Handle Text Transcript (User or Model)
    if (message.serverContent?.inputTranscription && this.onTranscript) {
      this.onTranscript(message.serverContent.inputTranscription.text, true);
    }
    // Model transcripts are not always sent in real-time in the same way, but we can try
    // Often audio is primary. If outputTranscription is enabled in config, we get it.
    
    // Handle Audio Output
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.outputAudioContext) {
      // Decode and play
      const audioBuffer = await decodeAudioData(
        base64ToUint8Array(audioData),
        this.outputAudioContext,
        24000
      );
      
      this.nextStartTime = Math.max(this.outputAudioContext.currentTime, this.nextStartTime);
      const source = this.outputAudioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputAudioContext.destination);
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    }

    // Handle Tool Calls
    if (message.toolCall) {
      for (const fc of message.toolCall.functionCalls) {
        if (this.onToolCall) {
          try {
            const result = await this.onToolCall(fc.name, fc.args);
            // Send response back
            this.sessionPromise?.then(session => {
              session.sendToolResponse({
                functionResponses: {
                  id: fc.id,
                  name: fc.name,
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

  disconnect() {
    // Close context and streams
    this.processor?.disconnect();
    this.source?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.inputAudioContext?.close();
    this.outputAudioContext?.close();
    
    // Note: session.close() isn't explicitly exposed on the promise result in the standard snippet 
    // but usually handled by dropping the connection or if the SDK supports it.
    // For now, we rely on cleaning up the client side.
    this.sessionPromise = null;
  }
}