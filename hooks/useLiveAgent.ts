import { useState, useRef } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';

const LIVE_MODEL = 'gemini-2.5-flash-native-audio-preview-12-2025';

interface UseLiveAgentProps {
  systemInstruction: string;
  voiceName?: string;
  onTranscriptUpdate: (text: string, isUser: boolean) => void;
}

export const useLiveAgent = ({ systemInstruction, voiceName, onTranscriptUpdate }: UseLiveAgentProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);

  // Audio Contexts
  const inputContextRef = useRef<AudioContext | null>(null);
  const outputContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  // Playback queue
  const nextStartTimeRef = useRef<number>(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  // Session
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const aiRef = useRef<GoogleGenAI | null>(null);

  // Helpers for PCM audio
  const createBlob = (data: Float32Array): { data: string; mimeType: string } => {
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      int16[i] = data[i] * 32768;
    }
    
    // Manual Base64 Encode
    let binary = '';
    const bytes = new Uint8Array(int16.buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    
    return {
      data: btoa(binary),
      mimeType: 'audio/pcm;rate=16000',
    };
  };

  const decodeAudioData = async (
    base64: string,
    ctx: AudioContext
  ): Promise<AudioBuffer> => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const dataInt16 = new Int16Array(bytes.buffer);
    const frameCount = dataInt16.length; 
    const buffer = ctx.createBuffer(1, frameCount, 24000);
    const channelData = buffer.getChannelData(0);
    
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i] / 32768.0;
    }
    return buffer;
  };

  const connect = async () => {
    try {
      if (!aiRef.current) {
        aiRef.current = new GoogleGenAI({ apiKey: process.env.API_KEY });
      }

      // 1. Setup Audio Inputs
      const stream = await navigator.mediaDevices.getUserMedia({ audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        autoGainControl: true,
        noiseSuppression: true
      }});
      streamRef.current = stream;

      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputCtx;
      
      const outputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      outputContextRef.current = outputCtx;

      const source = inputCtx.createMediaStreamSource(stream);
      // Reduce buffer size to 2048 for lower input latency (approx 128ms)
      const processor = inputCtx.createScriptProcessor(2048, 1, 1);
      scriptProcessorRef.current = processor;

      // 2. Setup Gemini Live Session
      sessionPromiseRef.current = aiRef.current.live.connect({
        model: LIVE_MODEL,
        config: {
          systemInstruction: systemInstruction,
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Zephyr' } },
          },
          inputAudioTranscription: {}, 
          outputAudioTranscription: {}, 
        },
        callbacks: {
            onopen: () => {
                console.log("Gemini Live Session Opened");
                setIsConnected(true);
                // Trigger AI to speak first
                setTimeout(() => {
                   sessionPromiseRef.current?.then(session => {
                      session.send({ parts: [{ text: "访谈现在开始。请根据你的系统指令，主动向用户打招呼，自我介绍，并开始第一各问题的提问。" }] });
                   });
                }, 500);
            },
            onmessage: async (message: LiveServerMessage) => {
                // Handle Transcriptions
                if (message.serverContent?.inputTranscription?.text) {
                   onTranscriptUpdate(message.serverContent.inputTranscription.text, true);
                }
                if (message.serverContent?.outputTranscription?.text) {
                   onTranscriptUpdate(message.serverContent.outputTranscription.text, false);
                }

                // Handle Audio Output
                const base64Audio = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
                if (base64Audio && outputContextRef.current) {
                    setIsSpeaking(true);
                    
                    const ctx = outputContextRef.current;
                    const now = ctx.currentTime;
                    
                    // LATENCY FIX & SMOOTHING: 
                    // If nextStartTimeRef is in the past (due to network delay or silence gap), 
                    // reset it to now + a tiny buffer (30ms) to prevent overlapping/clipping and ensure smooth start.
                    if (nextStartTimeRef.current < now) {
                        nextStartTimeRef.current = now + 0.03;
                    }

                    const audioBuffer = await decodeAudioData(base64Audio, ctx);
                    const sourceNode = ctx.createBufferSource();
                    sourceNode.buffer = audioBuffer;
                    sourceNode.connect(ctx.destination);
                    
                    sourceNode.onended = () => {
                        sourcesRef.current.delete(sourceNode);
                        if (sourcesRef.current.size === 0) setIsSpeaking(false);
                    };

                    sourceNode.start(nextStartTimeRef.current);
                    nextStartTimeRef.current += audioBuffer.duration;
                    sourcesRef.current.add(sourceNode);
                }

                if (message.serverContent?.interrupted) {
                    sourcesRef.current.forEach(node => node.stop());
                    sourcesRef.current.clear();
                    nextStartTimeRef.current = 0;
                    setIsSpeaking(false);
                }
            },
            onclose: () => {
                setIsConnected(false);
                console.log("Gemini Live Session Closed");
            },
            onerror: (err) => {
                console.error("Gemini Live Error", err);
                setIsConnected(false);
            }
        }
      });

      // 3. Start Streaming Audio
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        
        // Simple Volume Meter
        let sum = 0;
        for(let i=0; i<inputData.length; i++) sum += inputData[i] * inputData[i];
        setVolume(Math.sqrt(sum / inputData.length));

        const pcmBlob = createBlob(inputData);
        sessionPromiseRef.current?.then(session => {
            session.sendRealtimeInput({ media: pcmBlob });
        });
      };

      source.connect(processor);
      processor.connect(inputCtx.destination);

    } catch (e) {
      console.error("Connection failed", e);
    }
  };

  const disconnect = async () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    if (inputContextRef.current) inputContextRef.current.close();
    if (outputContextRef.current) outputContextRef.current.close();
    sourcesRef.current.forEach(s => s.stop());
    setIsConnected(false);
  };

  return { connect, disconnect, isConnected, isSpeaking, volume };
};