import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
    plugins: [react(), tailwindcss()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                popup:            fileURLToPath(new URL('./index.html',        import.meta.url)),
                'seat-demo':      fileURLToPath(new URL('./seat-demo.html',    import.meta.url)),
                background:       fileURLToPath(new URL('./src/background.ts', import.meta.url)),
                'content-script': fileURLToPath(new URL('./src/content-script.ts', import.meta.url)),
            },
            output: {
                chunkFileNames: 'assets/[name]-[hash].js',
                entryFileNames: (chunk) => {
                    // background.js và content-script.js phải ở root dist/
                    if (['background', 'content-script'].includes(chunk.name)) {
                        return '[name].js'
                    }
                    return 'assets/[name]-[hash].js'
                },
                assetFileNames: 'assets/[name]-[hash].[ext]',
            },
        },
    },
    resolve: {
        alias: {
            '@': fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
})