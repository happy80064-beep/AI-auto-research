import { useRef, useState } from 'react';

interface UseLiveAgentProps {
  systemInstruction: string;
  voiceName?: string;
  language?: 'zh' | 'en';
  onTranscriptUpdate: (text: string, isUser: boolean, isInterim?: boolean) => void;
}

const extractNextQuestion = async (systemInstruction: string, userText: string): Promise<string> => {
  const prompt = [
    systemInstruction,
    '',
    '请根据上面的访谈设定，用自然中文回复受访者，并提出下一句最合适的追问。回复不要超过 80 字。',
    userText ? `受访者刚刚说：${userText}` : '访谈刚开始，请主动开场、自我介绍，并提出第一个问题。',
  ].join('\n');

  const response = await fetch('/api/analyzeTranscripts?stream=1', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      data: {
        transcripts: prompt,
      },
    }),
  });

  if (!response.ok) throw new Error(`DeepSeek voice turn failed: ${response.status}`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Streaming response is not available.');

  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const packets = buffer.split('\n\n');
    buffer = packets.pop() || '';
    for (const packet of packets) {
      if (!packet.includes('event: result')) continue;
      const dataLine = packet.split('\n').find((line) => line.startsWith('data:'));
      if (!dataLine) continue;
      const result = JSON.parse(dataLine.slice(5));
      return String(result.summary || result.themes?.[0]?.topic || '谢谢分享，可以再具体说说吗？');
    }
  }

  return '谢谢分享，可以再具体说说吗？';
};

export const useLiveAgent = ({ systemInstruction, voiceName, language = 'zh', onTranscriptUpdate }: UseLiveAgentProps) => {
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);
  const recognitionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const lastFinalTextRef = useRef('');
  const pendingReplyRef = useRef(false);

  const speak = (text: string) => {
    if (!window.speechSynthesis || !text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'zh' ? 'zh-CN' : 'en-US';
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((voice) => voice.lang === utterance.lang && voice.name.includes(voiceName || ''));
    const fallback = voices.find((voice) => voice.lang === utterance.lang);
    utterance.voice = preferred || fallback || null;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  const requestAgentReply = async (userText: string) => {
    if (pendingReplyRef.current) return;
    pendingReplyRef.current = true;
    try {
      const reply = await extractNextQuestion(systemInstruction, userText);
      onTranscriptUpdate(reply, false);
      speak(reply);
    } catch (error) {
      console.error('DeepSeek interview reply failed', error);
    } finally {
      pendingReplyRef.current = false;
    }
  };

  const connect = async () => {
    try {
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = language === 'zh' ? 'zh-CN' : 'en-US';

        recognition.onresult = (event: any) => {
          let finalTranscript = '';
          let interimTranscript = '';

          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
          }

          if (interimTranscript.trim()) onTranscriptUpdate(interimTranscript, true, true);
          if (finalTranscript.trim()) {
            lastFinalTextRef.current = finalTranscript.trim();
            onTranscriptUpdate(lastFinalTextRef.current, true, false);
            requestAgentReply(lastFinalTextRef.current);
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== 'no-speech') console.warn('Speech recognition error', event.error);
        };

        recognition.onend = () => {
          if (recognitionRef.current) {
            try {
              recognition.start();
            } catch (error) {
              console.warn('Failed to restart speech recognition:', error);
            }
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: 16000 },
          channelCount: 1,
          echoCancellation: true,
          autoGainControl: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      const inputContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      inputContextRef.current = inputContext;
      const source = inputContext.createMediaStreamSource(stream);
      const processor = inputContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      processor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        let sum = 0;
        for (let i = 0; i < inputData.length; i += 1) sum += inputData[i] * inputData[i];
        setVolume(Math.sqrt(sum / inputData.length));
      };
      source.connect(processor);
      processor.connect(inputContext.destination);

      setIsConnected(true);
      setTimeout(() => requestAgentReply(''), 300);
    } catch (error) {
      console.error('Connection failed', error);
      setIsConnected(false);
    }
  };

  const disconnect = async () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    processorRef.current?.disconnect();
    await inputContextRef.current?.close();
    window.speechSynthesis?.cancel();
    setIsConnected(false);
    setIsSpeaking(false);
    setVolume(0);
  };

  return {
    connect,
    disconnect,
    isConnected,
    isSpeaking,
    volume,
  };
};
