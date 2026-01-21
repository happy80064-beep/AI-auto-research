import React from 'react';

interface VisualizerProps {
  volume: number;
  isActive: boolean;
  isSpeaking: boolean;
}

export const Visualizer: React.FC<VisualizerProps> = ({ volume, isActive, isSpeaking }) => {
  return (
    <div className="flex items-center justify-center gap-2 h-24">
      {[...Array(5)].map((_, i) => {
        // Dynamic height based on volume if active, else flat
        // If Model is speaking (isSpeaking), use a sine wave animation
        let height = 'h-2';
        let animation = '';
        
        if (isActive) {
           if (isSpeaking) {
               animation = 'animate-pulse';
               height = i % 2 === 0 ? 'h-16' : 'h-10';
           } else {
               // User mic volume visualization
               const threshold = (i + 1) * 0.1;
               height = volume > threshold ? `h-${Math.min(20, 4 + i * 4)}` : 'h-2';
           }
        }

        return (
          <div
            key={i}
            className={`w-4 bg-gradient-to-t from-google-blue to-google-red rounded-full transition-all duration-100 ease-in-out ${height} ${animation} opacity-80`}
            style={{ 
                height: isActive ? (isSpeaking ? undefined : `${Math.max(10, volume * 300 * (i % 2 === 0 ? 1 : 0.8))}px`) : '4px' 
            }}
          />
        );
      })}
    </div>
  );
};