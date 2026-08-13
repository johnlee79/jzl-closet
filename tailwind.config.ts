import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: '#14141A',
        paper: '#F6F5F2',
        stone: '#DBD7D1',
        muted: '#6E6A65',
        wine: '#6A2E3C',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        serif: ['"Gowun Batang"', 'serif'],
        sans: ['Pretendard', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        shell: '1400px',
      },
    },
  },
  plugins: [],
};

export default config;
