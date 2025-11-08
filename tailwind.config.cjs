/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  // We don't rely on Tailwind's dark: variants; we use CSS vars.
};
