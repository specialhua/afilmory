import react from '@astrojs/react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

export default defineConfig({
  site: 'https://afilmory.art',
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    envPrefix: ['PUBLIC_'],
  },
})
