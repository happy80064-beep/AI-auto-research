import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Use the stable Gemini 2.0 Flash model which supports multimodal input
const LIVE_MODEL = 'gemini-2.0-flash';

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
  
  // VAD & Buffer
  const audioAccumulatorRef = useRef<Float32Array[]>([]);
  const lastSpeechTimeRef = useRef<number>(0);
  const isCollectingAudioRef = useRef<boolean>(false);

  // Session  
  const sessionRef = useRef<any>(null);  
  const genAIRef = useRef<GoogleGenerativeAI | null>(null);  
  // Helpers for PCM audio  
  const createBlob = (data: Float32Array): { data: string; mimeType: string } => {  
    const l = data.length;  
    const int16 = new Int16Array(l);  
    for (let i = 0; i < l; i++) {  
      int16[i] = data[i] < 0 ? data[i] * 0x8000 : data[i] * 0x7FFF;  
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
      if (!genAIRef.current) {  
        // API Key should be passed from environment (Vite)
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';  
        if (!apiKey) {  
          throw new Error('GEMINI_API_KEY is not configured. Please set VITE_GEMINI_API_KEY in your environment.');  
        }  
        genAIRef.current = new GoogleGenerativeAI(apiKey);  
      }  
      // 1. Setup Audio Inputs  
      const stream = await navigator.mediaDevices.getUserMedia({   
        audio: {  
          sampleRate: { ideal: 16000 },  
          channelCount: 1,  
          echoCancellation: true,  
          autoGainControl: true,  
          noiseSuppression: true  
        }  
      });  
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
      try {  
        const model = genAIRef.current.getGenerativeModel({ model: LIVE_MODEL });  
          
        // Start live connection  
        sessionRef.current = await model.startChat({  
          history: [],  
          generationConfig: {  
            temperature: 0.7,  
          },  
        });  
        setIsConnected(true);  
        console.log("Gemini Live Session Connected");  
        // Trigger AI to speak first  
        setTimeout(async () => {  
          if (sessionRef.current) {  
            try {  
              const result = await sessionRef.current.sendMessage(  
                "访谈现在开始。请根据你的系统指令，主动向用户打招呼，自我介绍，并开始第一个问题的提问。"  
              );  
              const responseText = result.response.text();  
              onTranscriptUpdate(responseText, false);  
            } catch (err) {  
              console.error("Error sending initial message:", err);  
            }  
          }  
        }, 500);  
      } catch (err) {  
        console.error("Failed to start Gemini Live session:", err);  
        throw err;  
      }  
      // 3. Start Streaming Audio  
      processor.onaudioprocess = async (e) => {  
        const inputData = e.inputBuffer.getChannelData(0);  
        const dataCopy = new Float32Array(inputData); // Clone data
          
        // Simple Volume Meter  
        let sum = 0;  
        for(let i = 0; i < dataCopy.length; i++) {  
          sum += dataCopy[i] * dataCopy[i];  
        }  
        const rms = Math.sqrt(sum / dataCopy.length);
        setVolume(rms);
        
        // VAD Logic
        const SPEECH_THRESHOLD = 0.01;
        const SILENCE_DURATION = 1500; // 1.5s

        if (rms > SPEECH_THRESHOLD) {
             if (!isCollectingAudioRef.current) {
                 isCollectingAudioRef.current = true;
                 // console.log("Speech detected, starting collection...");
             }
             lastSpeechTimeRef.current = Date.now();
        }

        if (isCollectingAudioRef.current) {
            audioAccumulatorRef.current.push(dataCopy);

            // Check for silence
            if (Date.now() - lastSpeechTimeRef.current > SILENCE_DURATION) {
                // console.log("Silence detected, sending audio...");
                isCollectingAudioRef.current = false;
                
                // Process and send
                const chunks = audioAccumulatorRef.current;
                audioAccumulatorRef.current = []; // Clear immediately
                
                if (chunks.length > 0) {
                    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
                    const combined = new Float32Array(totalLength);
                    let offset = 0;
                    for(const chunk of chunks) {
                        combined.set(chunk, offset);
                        offset += chunk.length;
                    }

                    const pcmBlob = createBlob(combined);
                    if (sessionRef.current) {
                        try {
                           // Send accumulated audio as inline data
                           const result = await sessionRef.current.sendMessage([{ inlineData: pcmBlob }]);
                           const text = result.response.text();
                           if (text) {
                               onTranscriptUpdate(text, false);
                           }
                        } catch (err: any) {
                            console.error("Error sending accumulated audio:", err);
                        }
                    }
                }
            }
        }
      };  
      source.connect(processor);  
      processor.connect(inputCtx.destination);  
    } catch (e) {  
      console.error("Connection failed", e);  
      setIsConnected(false);  
    }  
  };  
  const disconnect = async () => {  
    try {  
      if (streamRef.current) {  
        streamRef.current.getTracks().forEach(t => t.stop());  
      }  
      if (inputContextRef.current) {  
        inputContextRef.current.close();  
      }  
      if (outputContextRef.current) {  
        outputContextRef.current.close();  
      }  
      sourcesRef.current.forEach(s => s.stop());  
      sourcesRef.current.clear();  
      sessionRef.current = null;  
      setIsConnected(false);  
    } catch (err) {  
      console.error("Error during disconnect:", err);  
    }  
  };  
  return {   
    connect,   
    disconnect,   
    isConnected,   
    isSpeaking,   
    volume   
  };  
};  
