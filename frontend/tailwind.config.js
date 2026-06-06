/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // 背景色 - 使用 CSS 变量
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',

        // 文字色 - 使用 CSS 变量
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-muted': 'var(--text-muted)',

        // 强调色（保持不变，不随主题变化）
        'accent': '#4CA6E1',
        'accent-hover': '#3D95D0',
        'accent-active': '#2E84BF',

        // 功能色
        'success': '#52C41A',
        'warning': '#FAAD14',
        'error': '#F5222D',
        'unread': '#FF4D4F',

        // 平台色（保持不变）
        'platform-zhihu': '#0084FF',
        'platform-x': '#000000',
        'platform-bilibili': '#FB7299',
        'platform-youtube': '#FF0000',
        'platform-wechat': '#07C160',
        'platform-news': '#FF6B6B',
        'platform-custom': '#6B7280',
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
        mono: ['"SF Mono"', 'Monaco', '"Inconsolata"', '"Fira Code"', 'monospace'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      fontSize: {
        'xs': ['11px', { lineHeight: '1.4' }],
        'sm': ['12px', { lineHeight: '1.5' }],
        'base': ['14px', { lineHeight: '1.6' }],
        'lg': ['16px', { lineHeight: '1.5' }],
        'xl': ['20px', { lineHeight: '1.4' }],
        '2xl': ['24px', { lineHeight: '1.3' }],
      },
      borderRadius: {
        'card': '8px',
        'modal': '12px',
      },
      boxShadow: {
        'card': '0 1px 3px var(--shadow-color)',
        'card-hover': '0 4px 12px var(--shadow-color-hover)',
      },
      maxWidth: {
        'content': '1440px',
      },
      borderColor: {
        DEFAULT: 'var(--border-color)',
      },
    },
  },
  plugins: [],
}
