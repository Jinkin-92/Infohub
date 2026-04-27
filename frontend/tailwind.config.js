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
        canvas: 'var(--color-bg-canvas)',
        surface: 'var(--color-bg-surface)',
        'surface-muted': 'var(--color-bg-surface-muted)',
        'surface-strong': 'var(--color-bg-surface-strong)',

        'content-primary': 'var(--color-text-primary)',
        'content-secondary': 'var(--color-text-secondary)',
        'content-tertiary': 'var(--color-text-tertiary)',
        'content-muted': 'var(--color-text-muted)',

        // 背景色 - 使用 CSS 变量
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-tertiary': 'var(--bg-tertiary)',

        // 文字色 - 使用 CSS 变量
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-tertiary': 'var(--text-tertiary)',
        'text-muted': 'var(--text-muted)',

        // 强调色
        'accent': 'var(--color-accent-primary)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-active': 'var(--color-accent-active)',
        'accent-soft': 'var(--color-accent-soft)',

        // 功能色
        'success': 'var(--color-feedback-success)',
        'warning': 'var(--color-feedback-warning)',
        'error': 'var(--color-feedback-error)',
        'info': 'var(--color-feedback-info)',
        'unread': 'var(--color-unread-dot)',

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
        'card-hover': '0 8px 24px var(--shadow-color-hover)',
      },
      maxWidth: {
        'content': '1280px',
      },
      borderColor: {
        DEFAULT: 'var(--border-color)',
      },
    },
  },
  plugins: [],
}
