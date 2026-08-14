import type { Config } from 'tailwindcss';

const config: Config = {
  // ★ 관리자 화면에만 다크모드를 씁니다. 고객 화면은 항상 밝게 갑니다.
  //   html 에 .dark 가 붙으면 .dark .admin-root 규칙이 켜집니다. (app/globals.css)
  darkMode: 'class',
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
        muted: '#55524E', // 캡션·라벨 전용. 본문에는 ink 를 쓴다
        wine: '#6A2E3C',
      },
      fontFamily: {
        display: ['"Cormorant Garamond"', 'serif'],
        serif: ['"Gowun Batang"', 'serif'],
        sans: ['"Pretendard Variable"', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      maxWidth: {
        shell: '1400px',
      },
    },
  },
  plugins: [],
};

export default config;
