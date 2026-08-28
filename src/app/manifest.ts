import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Degenerate Sweepstake',
    short_name: 'Sweepstake',
    description: '2026/27 Football Sweepstake — Match Centre, Standings & Power-Ups',
    start_url: '/dashboard',
    display: 'standalone',
    background_color: '#0d0f1a',
    theme_color: '#0f1117',
    icons: [
      { src: '/icon', sizes: '64x64', type: 'image/png' },
      { src: '/apple-icon', sizes: '180x180', type: 'image/png' },
    ],
  }
}
