/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Tailwind v4 maneja safelist automáticamente, pero mantenemos clases específicas para highlighting
  safelist: [
    'bg-yellow-200',
    'text-yellow-800',
    'px-1',
    'rounded'
  ],
  // Configuración específica para v4
  theme: {
    extend: {
      colors: {
        // Paleta semántica enlazada a variables CSS (light/dark automáticas)
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        elevated: 'var(--color-elevated)',
        border: 'var(--color-border)',
        text: 'var(--color-text)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-subtle': 'var(--color-text-subtle)',
        accent: 'var(--color-accent)',
        'accent-hover': 'var(--color-accent-hover)',
        'accent-on': 'var(--color-accent-on)',
        danger: 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        warning: 'var(--color-warning)',
        'warning-bg': 'var(--color-warning-bg)',
        success: 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        // Categorías
        'cat-general-bg': 'var(--cat-general-bg)',
        'cat-artist-bg': 'var(--cat-artist-bg)',
        'cat-copyright-bg': 'var(--cat-copyright-bg)',
        'cat-character-bg': 'var(--cat-character-bg)',
        'cat-meta-bg': 'var(--cat-meta-bg)',
        'cat-default-bg': 'var(--cat-default-bg)'
      }
    }
  }
}
