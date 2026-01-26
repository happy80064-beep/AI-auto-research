import { useState, useRef } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Use the stable Gemini 2.0 Flash model which supports multimodal input
const LIVE_MODEL = 'gemini-2.0-flash';

interface UseLiveAgentProps {
  systemInstruction: string;  
  voiceName?: string;
  language?: 'zh' | 'en';
  onTranscriptUpdate: (text: string, isUser: boolean, isInterim?: boolean) => void;  
}  
export const useLiveAgent = ({ systemInstruction, voiceName, language = 'zh', onTranscriptUpdate }: UseLiveAgentProps) => {  
  const [isConnected, setIsConnected] = useState(false);  
  const [isSpeaking, setIsSpeaking] = useState(false);  
  const [volume, setVolume] = useState(0);  
  // Audio Contexts  
  const inputContextRef = useRef<AudioContext | null>(null);  
  const outputContextRef = useRef<AudioContext | null>(null);  
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);  
  const streamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<any>(null);
  
    
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
  // Helpers for WAV encoding
  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  // Text-to-Speech Helper
  const speak = (text: string) => {
    if (!window.speechSynthesis) return;
    
    // Stop any current speech to avoid overlap
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Set language
    utterance.lang = language === 'zh' ? 'zh-CN' : 'en-US';
    
    // Simple heuristic for voice gender/tone (optional)
    // We can't easily match the "Gemini" voices, but we can try to find a decent system voice.
    const voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
        // Prefer a Google voice if available (often better quality on Chrome)
        const preferredVoice = voices.find(v => 
            v.lang === utterance.lang && v.name.includes('Google')
        );
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
    }

    window.speechSynthesis.speak(utterance);
  };

  const createWavBlob = (data: Float32Array): { data: string; mimeType: string } => {
    const sampleRate = 16000;
    const numChannels = 1;
    const bitsPerSample = 16;
    
    // Convert Float32 to Int16
    const l = data.length;
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) {
      // Clamp values
      const s = Math.max(-1, Math.min(1, data[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const buffer = new ArrayBuffer(44 + int16.length * 2);
    const view = new DataView(buffer);

    /* RIFF identifier */
    writeString(view, 0, 'RIFF');
    /* RIFF chunk length */
    view.setUint32(4, 36 + int16.length * 2, true);
    /* RIFF type */
    writeString(view, 8, 'WAVE');
    /* format chunk identifier */
    writeString(view, 12, 'fmt ');
    /* format chunk length */
    view.setUint32(16, 16, true);
    /* sample format (raw) */
    view.setUint16(20, 1, true);
    /* channel count */
    view.setUint16(22, numChannels, true);
    /* sample rate */
    view.setUint32(24, sampleRate, true);
    /* byte rate (sample rate * block align) */
    view.setUint32(28, sampleRate * 2, true);
    /* block align (channel count * bytes per sample) */
    view.setUint16(32, numChannels * 2, true);
    /* bits per sample */
    view.setUint16(34, bitsPerSample, true);
    /* data chunk identifier */
    writeString(view, 36, 'data');
    /* data chunk length */
    view.setUint32(40, int16.length * 2, true);

    // Write audio data
    const pcmData = new Int16Array(buffer, 44);
    pcmData.set(int16);

    // Convert to Base64
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
      
    return {
      data: btoa(binary),
      mimeType: 'audio/wav',
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
      // 0. Setup Speech Recognition (for User Transcript)
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true; // Enable interim results for faster feedback
        recognition.lang = language === 'zh' ? 'zh-CN' : 'en-US';

        recognition.onresult = (event: any) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    finalTranscript += event.results[i][0].transcript;
                } else {
                    interimTranscript += event.results[i][0].transcript;
                }
            }
            
            if (finalTranscript.trim()) {
                console.log("User Speech Final:", finalTranscript);
                onTranscriptUpdate(finalTranscript, true, false);
            }
            
            if (interimTranscript.trim()) {
                onTranscriptUpdate(interimTranscript, true, true);
            }
        };
        
        recognition.onerror = (event: any) => {
             // Ignore no-speech errors as they are common in continuous mode
             if (event.error !== 'no-speech') {
                console.warn("Speech recognition error", event.error);
             }
        };

        recognition.onend = () => {
            // Restart recognition if it stops unexpectedly while the session is active
            if (recognitionRef.current) {
                try {
                    recognition.start();
                    console.log("Speech recognition restarted");
                } catch (e) {
                    console.warn("Failed to restart speech recognition:", e);
                }
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
        } catch (e) {
            console.warn("Failed to start speech recognition:", e);
        }
      }

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
        const model = genAIRef.current.getGenerativeModel({ 
            model: LIVE_MODEL,
            systemInstruction: systemInstruction 
        });  
          
        // Start live connection  
        sessionRef.current = await model.startChat({  
          history: [],  
          generationConfig: {  
            temperature: 0.7,
            speechConfig: voiceName ? {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: voiceName
                }
              }
            } : undefined, 
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
              speak(responseText);  
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

                    const wavBlob = createWavBlob(combined);
                    if (sessionRef.current) {
                        try {
                           // Send accumulated audio as inline data
                           const result = await sessionRef.current.sendMessage([{ inlineData: wavBlob }]);
                           const text = result.response.text();
                           if (text) {
                               onTranscriptUpdate(text, false);
                               speak(text);
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
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }  
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
