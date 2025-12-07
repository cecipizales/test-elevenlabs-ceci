export class ElevenLabsClient {
  private apiKey: string;
  private voiceId: string;
  private ctx: AudioContext;

  constructor(apiKey: string, voiceId: string, ctx: AudioContext) {
    this.apiKey = apiKey;
    this.voiceId = voiceId;
    this.ctx = ctx;
  }

  async streamText(text: string): Promise<AudioBuffer | null> {
    if (!text.trim()) return null;

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': this.apiKey,
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_turbo_v2_5', // Low latency model
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (!response.ok) {
        console.error("ElevenLabs API Error", await response.text());
        return null;
      }

      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      return audioBuffer;

    } catch (err) {
      console.error("ElevenLabs Streaming Failed", err);
      return null;
    }
  }
}