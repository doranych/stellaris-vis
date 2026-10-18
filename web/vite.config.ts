import { defineConfig } from 'vite'

// GitHub Pages serves the site from /<repository>/, which CI passes in BASE_PATH.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
})
