import React, { useState, useEffect, useRef } from 'react';
import { useLanguage } from '../contexts/LanguageContext';

interface VoiceInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  className?: string;
  id?: string;
  activeId?: string | null;
  onVoiceStart?: (id: string) => void;
  onVoiceEnd?: (id: string) => void;
}

export const VoiceInput: React.FC<VoiceInputProps> = ({ 
  value, 
  onChange, 
  placeholder, 
  multiline = false,
  className = "",
  id,
  activeId,
  onVoiceStart,
  onVoiceEnd
}) => {
  const { t } = useLanguage();
  const [isListening, setIsListening] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const recognitionRef = useRef<any>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onVoiceEndRef = useRef(onVoiceEnd);
  const idRef = useRef(id);
  const isMounted = useRef(true);

  useEffect(() => {
    valueRef.current = value;
    onChangeRef.current = onChange;
    onVoiceEndRef.current = onVoiceEnd;
    idRef.current = id;
  }, [value, onChange, onVoiceEnd, id]);

  useEffect(() => {
    isMounted.current = true;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      // Note: Ideally lang should follow global language (zh-CN or en-US)
      // But keeping zh-CN default for now as per legacy behavior or update based on language context
      recognition.lang = 'zh-CN'; 
      recognition.interimResults = true;

      recognition.onstart = () => {
        if (isMounted.current) {
          setIsListening(true);
          setErrorMessage(null);
        }
      };

      recognition.onend = () => {
        if (isMounted.current) {
          setIsListening(false);
          if (idRef.current && onVoiceEndRef.current) {
            onVoiceEndRef.current(idRef.current);
          }
        }
      };

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

        if (finalTranscript) {
             const currentVal = valueRef.current;
             const newValue = currentVal ? `${currentVal} ${finalTranscript}` : finalTranscript;
             if (onChangeRef.current) {
                 onChangeRef.current(newValue);
             }
        }
        
        if (isMounted.current) {
          setErrorMessage(null);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'no-speech' || event.error === 'aborted') {
             return;
        }
        if (isMounted.current) {
          setIsListening(false);
          if (event.error === 'network') {
            setErrorMessage(t('voice.error.network'));
          } else {
            setErrorMessage(t('voice.error.general'));
          }
        }
      };

      recognitionRef.current = recognition;

      return () => {
        isMounted.current = false;
        if (recognitionRef.current) {
            try { recognitionRef.current.abort(); } catch(e) { }
        }
      };
    }
  }, [t]); 

  useEffect(() => {
    if (isListening && activeId && id && activeId !== id) {
        if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (e) { }
        }
    }
  }, [activeId, id, isListening]);

  const toggleListening = () => {
    setErrorMessage(null);

    if (!recognitionRef.current) {
      setErrorMessage(t('voice.error.support'));
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
    } else {
      if (id && onVoiceStart) onVoiceStart(id);
      try {
        recognitionRef.current.abort(); 
        recognitionRef.current.start();
      } catch (e) {
        setErrorMessage(t('voice.error.start'));
        if (id && onVoiceEnd) onVoiceEnd(id);
      }
    }
  };

  const baseInputClass = `w-full bg-[#E5E5EA] text-black rounded-2xl p-4 outline-none border border-transparent focus:border-ios-blue transition-all placeholder-gray-400 ${className}`;
  const buttonPositionClass = multiline ? 'top-3' : 'top-1/2 -translate-y-1/2';

  return (
    <div className="relative w-full">
      {multiline ? (
        <textarea
          className={`${baseInputClass} h-32 resize-none pr-12`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
        />
      ) : (
        <input
          type="text"
          className={`${baseInputClass} pr-12`}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (errorMessage) setErrorMessage(null);
          }}
        />
      )}
      
      <button
        onClick={toggleListening}
        className={`absolute right-3 ${buttonPositionClass} p-2 rounded-full transition-all duration-300 ${
          isListening 
            ? 'bg-ios-red text-white scale-110 shadow-lg' 
            : 'text-gray-400 hover:text-black hover:bg-gray-200'
        }`}
      >
        {isListening ? (
           <svg className="w-5 h-5 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        ) : (
           <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
           </svg>
        )}
      </button>

      {errorMessage && (
        <div className="absolute -bottom-6 left-2 text-[10px] text-ios-red font-medium bg-red-50 px-2 py-0.5 rounded border border-red-100">
          {errorMessage}
        </div>
      )}
    </div>
  );
};