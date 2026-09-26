// Color palette definitions for the app
export const colors = {
  // Define base colors
  dark: {
    background: {
      primary: '#111',
      secondary: '#222',
      tertiary: '#333',
    },
    text: {
      primary: '#fff',
      secondary: '#aaa',
      tertiary: '#777',
    },
    accent: {
      primary: '#0088ff',
      secondary: '#00aaff',
    },
    border: '#333',
  },

  light: {
    background: {
      primary: '#fff',
      secondary: '#f5f5f5',
      tertiary: '#eaeaea',
    },
    text: {
      primary: '#111',
      secondary: '#555',
      tertiary: '#999',
    },
    accent: {
      primary: '#0066cc',
      secondary: '#0088dd',
    },
    border: '#ddd',
  },
};

// Export color variables for tailwind config
export const themeColors = {
  'background-primary': 'var(--background-primary)',
  'background-secondary': 'var(--background-secondary)',
  'background-tertiary': 'var(--background-tertiary)',
  'text-primary': 'var(--text-primary)',
  'text-secondary': 'var(--text-secondary)',
  'text-tertiary': 'var(--text-tertiary)',
  'accent-primary': 'var(--accent-primary)',
  'accent-secondary': 'var(--accent-secondary)',
  border: 'var(--border)',
};
