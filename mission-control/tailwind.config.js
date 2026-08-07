/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          950: '#020617',
          900: '#0f172a',
          850: '#0b1221',
          800: '#1e293b',
          750: '#182233',
          700: '#334155',
        },
        // ─── Abyssal Dark Mode — bioluminescent HUD palette ─────────────
        // Low-light tactical display: near-black void, bio-luminescent
        // accents. Operators run night ops — no glare, high contrast on
        // critical state only.
        abyss: {
          void: '#04060f',      // base background (near-black, navy cast)
          surface: '#0a101f',   // panel surface
          glass: 'rgba(20,27,45,0.72)', // glassmorphism fill
          line: 'rgba(100,210,255,0.18)', // glass border
        },
        bio: {
          cyan: '#00e5ff',      // primary accent (bioluminescent)
          teal: '#00b4d8',      // depth / secondary
          green: '#00ff88',     // nominal / sonar green
          amber: '#ffbb00',     // caution / partitioned
          red: '#ff3366',       // critical / pressure red
        },
      },
      fontFamily: {
        hud: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'hud-sweep': 'hudSweep 3s linear infinite',
        'sonar-ping': 'sonarPing 2.5s ease-out infinite',
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        hudSweep: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        sonarPing: {
          '0%': { transform: 'scale(0.6)', opacity: '0.8' },
          '100%': { transform: 'scale(1.8)', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
