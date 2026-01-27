export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./contexts/**/*.{js,ts,jsx,tsx}",
    "./App.tsx",
    "./index.tsx",
  ],
  theme: {
    extend: {
      colors: {
        ios: {
          bg: '#F2F2F7',      // System Grouped Background
          card: '#FFFFFF',    // Primary Card Background
          cardHigh: '#F9F9F9',// Secondary / Highlighted Card
          input: '#E5E5EA',   // System Fill
          blue: '#007AFF',    // System Blue
          green: '#34C759',   // System Green
          red: '#FF3B30',     // System Red
          yellow: '#FFCC00',  // System Yellow
          gray: '#8E8E93',    // System Gray
          text: '#000000',    // Primary Text
          subtext: '#3C3C4399', // Secondary Label Color (60% opacity)
          separator: '#C6C6C8', // Separator Line
        },
        google: {
          blue: '#4285F4',
          red: '#EA4335',
          yellow: '#FBBC05',
          green: '#34A853',
        },
        // New Dark Theme Colors
        mizzen: {
          bg: '#050B14',      // Deepest background
          card: '#0F1623',    // Panel background
          cardHover: '#1A2435',
          border: '#1E293B',
          blue: '#3B82F6',
          green: '#10B981',   // Neon Green
          text: '#F8FAFC',
          textMuted: '#64748B',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'SF Pro Text', 'SF Pro Display', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        'ios': '0 2px 12px rgba(0, 0, 0, 0.06)',
        'ios-hover': '0 8px 24px rgba(0, 0, 0, 0.12)',
        'glow-blue': '0 0 15px rgba(0, 122, 255, 0.4)',
        'glow-green': '0 0 15px rgba(16, 185, 129, 0.3)',
      },
      keyframes: {
        'breathe-blue': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(0, 122, 255, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(0, 122, 255, 0.8)' },
        },
        'breathe-green': {
          '0%, 100%': { boxShadow: '0 0 10px rgba(52, 199, 89, 0.4)' },
          '50%': { boxShadow: '0 0 20px rgba(52, 199, 89, 0.8)' },
        },
      },
      animation: {
        'breathe-blue': 'breathe-blue 2s infinite ease-in-out',
        'breathe-green': 'breathe-green 2s infinite ease-in-out',
      }
    }
  },
  plugins: [],
}
