type MonthlyShareRow = {
  player_name: string
  player_color?: string
  monthly_points: number
  monthly_wins: number
  monthly_draws: number
  monthly_losses: number
}

const MEDALS = ['🥇', '🥈', '🥉']

// Matches src/app/globals.css design tokens — the app is dark-theme-only,
// so these are hardcoded rather than read from computed styles.
const PALETTE = {
  page: '#0d0f1a',
  card: '#161929',
  border: '#252840',
  textPrimary: '#f0f2f8',
  textSecondary: '#9ca3b8',
  textMuted: '#5c6080',
  accent: '#22d3ee',
  green: '#10b981',
  amber: '#f59e0b',
  red: '#ef4444',
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.substring(0, 2), 16)
  const g = parseInt(clean.substring(2, 4), 16)
  const b = parseInt(clean.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function monthLabelFor(month: string): string {
  const [y, m] = month.split('-')
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
}

/** Draws a monthly standings table to an off-screen canvas and returns it as a PNG blob. */
function renderMonthlyTableImage({
  leagueName,
  month,
  rows,
}: {
  leagueName: string
  month: string
  rows: MonthlyShareRow[]
}): Promise<Blob> {
  const width = 720
  const rowH = 60
  const headerH = 92
  const footerH = 36
  const padX = 24
  const height = headerH + rows.length * rowH + footerH

  const dpr = Math.min(window.devicePixelRatio || 1, 3)
  const canvas = document.createElement('canvas')
  canvas.width = width * dpr
  canvas.height = height * dpr
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas not supported'))
  ctx.scale(dpr, dpr)

  ctx.fillStyle = PALETTE.card
  ctx.fillRect(0, 0, width, height)

  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.textPrimary
  ctx.font = `700 22px ${FONT}`
  ctx.fillText(`🏆 ${leagueName}`, padX, 38)
  ctx.fillStyle = PALETTE.textSecondary
  ctx.font = `600 15px ${FONT}`
  ctx.fillText(monthLabelFor(month), padX, 64)

  ctx.strokeStyle = PALETTE.border
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, headerH)
  ctx.lineTo(width, headerH)
  ctx.stroke()

  rows.forEach((row, i) => {
    const rowY = headerH + i * rowH
    const centerY = rowY + rowH / 2
    const isLast = i === rows.length - 1 && rows.length > 1

    if (row.player_color) {
      ctx.fillStyle = hexToRgba(row.player_color, 0.07)
      ctx.fillRect(0, rowY, width, rowH)
    }
    if (i < rows.length - 1) {
      ctx.strokeStyle = PALETTE.border
      ctx.beginPath()
      ctx.moveTo(0, rowY + rowH)
      ctx.lineTo(width, rowY + rowH)
      ctx.stroke()
    }

    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const medal = MEDALS[i]
    if (medal) {
      ctx.font = `20px ${FONT}`
      ctx.fillStyle = PALETTE.textPrimary
      ctx.fillText(medal, padX + 14, centerY)
    } else {
      ctx.font = `700 16px ${FONT}`
      ctx.fillStyle = isLast ? PALETTE.red : PALETTE.textMuted
      ctx.fillText(String(i + 1), padX + 14, centerY)
    }

    ctx.fillStyle = row.player_color ?? PALETTE.accent
    ctx.beginPath()
    ctx.arc(padX + 44, centerY, 5, 0, Math.PI * 2)
    ctx.fill()

    ctx.textAlign = 'left'
    ctx.fillStyle = PALETTE.textPrimary
    ctx.font = `600 17px ${FONT}`
    ctx.fillText(row.player_name, padX + 60, centerY, width - 300)

    ctx.textAlign = 'right'
    ctx.font = `600 13px ${FONT}`
    ctx.fillStyle = PALETTE.green
    ctx.fillText(`${row.monthly_wins}W`, width - 196, centerY)
    ctx.fillStyle = PALETTE.amber
    ctx.fillText(`${row.monthly_draws}D`, width - 152, centerY)
    ctx.fillStyle = PALETTE.red
    ctx.fillText(`${row.monthly_losses}L`, width - 108, centerY)

    ctx.fillStyle = PALETTE.textPrimary
    ctx.font = `800 20px ${FONT}`
    ctx.fillText(String(row.monthly_points), width - padX, centerY)
  })

  ctx.textAlign = 'center'
  ctx.fillStyle = PALETTE.textMuted
  ctx.font = `500 11px ${FONT}`
  ctx.fillText('Sweepstake Season', width / 2, height - 15)

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('Failed to render image'))), 'image/png')
  })
}

function textSummary({
  leagueName,
  month,
  rows,
  publicUrl,
}: {
  leagueName: string
  month: string
  rows: MonthlyShareRow[]
  publicUrl?: string
}): string {
  const lines = [
    `🏆 ${leagueName} — ${monthLabelFor(month)}`,
    '',
    ...rows.map((r, i) =>
      `${MEDALS[i] ?? `${i + 1}.`} ${r.player_name} — ${r.monthly_points}pts (${r.monthly_wins}W ${r.monthly_draws}D ${r.monthly_losses}L)`
    ),
  ]
  if (publicUrl) lines.push('', `📊 Full table: ${publicUrl}`)
  return lines.join('\n')
}

function openWhatsAppText(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * Shares a screenshot of one month's standings to WhatsApp. On mobile this
 * hands the rendered PNG straight to the native share sheet (Web Share API
 * with files) so the sender picks a contact/group and the image attaches
 * itself. Browsers that can't share files (desktop) get the PNG downloaded
 * and WhatsApp Web opened with the caption pre-filled, so the sender only
 * has to attach the file they just saved.
 */
export async function shareMonthlyTableToWhatsApp({
  leagueName,
  month,
  rows,
  publicUrl,
}: {
  leagueName: string
  month: string
  rows: MonthlyShareRow[]
  publicUrl?: string
}) {
  const caption = [`🏆 ${leagueName} — ${monthLabelFor(month)}`, publicUrl ? `📊 Full table: ${publicUrl}` : null]
    .filter(Boolean)
    .join('\n')

  let blob: Blob | null = null
  try {
    blob = await renderMonthlyTableImage({ leagueName, month, rows })
  } catch {
    blob = null
  }

  if (!blob) {
    openWhatsAppText(textSummary({ leagueName, month, rows, publicUrl }))
    return
  }

  const filename = `${leagueName.replace(/\s+/g, '-').toLowerCase()}-${month}-standings.png`
  const file = new File([blob], filename, { type: 'image/png' })

  const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: caption })
      return
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      // fall through to the download + text fallback below
    }
  }

  downloadBlob(blob, filename)
  openWhatsAppText(`${caption}\n\n🖼️ Table image saved to your downloads — attach it here in WhatsApp.`)
}
