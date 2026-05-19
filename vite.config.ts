import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteSingleFile } from 'vite-plugin-singlefile'
import { resolve } from 'path'

export default defineConfig(() => {
  const isSandbox = process.env.BUILD_TARGET === 'sandbox'
  if (isSandbox) {
    return {
      build: {
        outDir: 'dist',
        emptyOutDir: false,
        target: 'es2017',
        lib: {
          entry: resolve(__dirname, 'src/sandbox/main.ts'),
          formats: ['iife'],
          name: 'sandbox',
          fileName: () => 'code.js',
        },
      },
    }
  }
  return {
    plugins: [react(), viteSingleFile()],
    root: resolve(__dirname, 'src/ui'),
    build: {
      outDir: resolve(__dirname, 'dist'),
      emptyOutDir: true,
      rollupOptions: { input: resolve(__dirname, 'src/ui/index.html') },
    },
  }
})
