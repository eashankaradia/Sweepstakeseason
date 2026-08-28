import { ImageResponse } from 'next/og'

export const size = { width: 64, height: 64 }
export const contentType = 'image/png'

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #6d28d9 0%, #22d3ee 100%)',
          borderRadius: 14,
        }}
      >
        <svg width="40" height="46" viewBox="0 0 24 28" fill="none">
          <path
            d="M12 1L2 5v8c0 6.075 4.477 11.742 10 13 5.523-1.258 10-6.925 10-13V5L12 1Z"
            fill="white"
            fillOpacity="0.95"
          />
          <path
            d="M8 13.5l2.5 2.5L16 10.5"
            stroke="#0d0f1a"
            strokeWidth="2.25"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  )
}
