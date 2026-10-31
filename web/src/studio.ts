import QRCodeStyling from 'qr-code-styling'
import { ApiError, listLinks, type LinkItem } from './api'
import { buildPayload, type PayloadInput } from './qr/payload'
import { checkScannability, summarizeChecks, type Check, type EccLevel } from './qr/scannability'

type QrOptions = NonNullable<ConstructorParameters<typeof QRCodeStyling>[0]>
type Mode = 'dynamic' | 'static'
type DotStyle = 'rounded' | 'extra-rounded' | 'dots' | 'classy' | 'classy-rounded' | 'square'
type CornerStyle = 'extra-rounded' | 'square' | 'dot'
type CornerDotStyle = 'dot' | 'square'

type Preset = {
  dots: string
  corners: string
  background: string
  dotStyle: DotStyle
  cornerStyle: CornerStyle
  cornerDot: CornerDotStyle
}

const PRESETS: Record<string, Preset> = {
  obsidian: {
    dots: '#09090b', corners: '#18181b', background: '#ffffff',
    dotStyle: 'rounded', cornerStyle: 'extra-rounded', cornerDot: 'dot',
  },
  minimal: {
    dots: '#27272a', corners: '#09090b', background: '#ffffff',
    dotStyle: 'square', cornerStyle: 'square', cornerDot: 'square',
  },
  silver: {
    dots: '#52525b', corners: '#27272a', background: '#ffffff',
    dotStyle: 'classy-rounded', cornerStyle: 'extra-rounded', cornerDot: 'dot',
  },
  charcoal: {
    dots: '#18181b', corners: '#000000', background: '#ffffff',
    dotStyle: 'extra-rounded', cornerStyle: 'extra-rounded', cornerDot: 'dot',
  },
}

const PREVIEW_SIZE = 300
const SVG_EXPORT_SIZE = 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 500 * 1024

const CHECK_STYLES: Record<Check['level'], string> = {
  ok: 'bg-green-100 text-green-900',
  warning: 'bg-amber-100 text-amber-900',
  problem: 'bg-red-100 text-red-900',
}
const CHECK_LABELS: Record<Check['level'], string> = {
  ok: 'Passed',
  warning: 'Warning',
  problem: 'Problem',
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing element #${id}`)
  return node as T
}

const dynamicPanel = byId<HTMLElement>('dynamic-panel')
const staticPanel = byId<HTMLElement>('static-panel')
const dynamicLink = byId<HTMLSelectElement>('dynamic-link')
const dynamicNote = byId<HTMLElement>('dynamic-note')
const staticType = byId<HTMLSelectElement>('static-type')
const formUrl = byId<HTMLElement>('form-url')
const formText = byId<HTMLElement>('form-text')
const formWifi = byId<HTMLElement>('form-wifi')
const formEmail = byId<HTMLElement>('form-email')
const staticUrl = byId<HTMLInputElement>('static-url')
const staticText = byId<HTMLTextAreaElement>('static-text')
const wifiSsid = byId<HTMLInputElement>('wifi-ssid')
const wifiPassword = byId<HTMLInputElement>('wifi-password')
const wifiSecurity = byId<HTMLSelectElement>('wifi-security')
const wifiHidden = byId<HTMLInputElement>('wifi-hidden')
const emailTo = byId<HTMLInputElement>('email-to')
const emailSubject = byId<HTMLInputElement>('email-subject')
const emailBody = byId<HTMLTextAreaElement>('email-body')

const dotStyleSelect = byId<HTMLSelectElement>('dot-style')
const cornerStyleSelect = byId<HTMLSelectElement>('corner-style')
const cornerDotSelect = byId<HTMLSelectElement>('corner-dot-style')
const dotsPicker = byId<HTMLInputElement>('dots-color')
const dotsHex = byId<HTMLInputElement>('dots-hex')
const cornersPicker = byId<HTMLInputElement>('corners-color')
const cornersHex = byId<HTMLInputElement>('corners-hex')
const backgroundPicker = byId<HTMLInputElement>('background-color')
const backgroundHex = byId<HTMLInputElement>('background-hex')
const transparentBox = byId<HTMLInputElement>('transparent')
const logoFile = byId<HTMLInputElement>('logo-file')
const logoControls = byId<HTMLElement>('logo-controls')
const logoScale = byId<HTMLInputElement>('logo-scale')
const logoScaleLabel = byId<HTMLElement>('logo-scale-label')
const logoRemove = byId<HTMLButtonElement>('logo-remove')
const marginRange = byId<HTMLInputElement>('margin-percent')
const marginLabel = byId<HTMLElement>('margin-label')
const eclSelect = byId<HTMLSelectElement>('ecl')
const exportSize = byId<HTMLSelectElement>('export-size')

const previewBox = byId<HTMLDivElement>('qr-preview')
const previewEmpty = byId<HTMLElement>('preview-empty')
const checksList = byId<HTMLUListElement>('checks')
const checkSummary = byId<HTMLElement>('check-summary')
const downloadSvg = byId<HTMLButtonElement>('download-svg')
const downloadPng = byId<HTMLButtonElement>('download-png')
const copySvg = byId<HTMLButtonElement>('copy-svg')
const statusBox = byId<HTMLElement>('studio-status')

const style = {
  dots: '#09090b',
  corners: '#18181b',
  background: '#ffffff',
  transparent: false,
  dotStyle: 'rounded' as DotStyle,
  cornerStyle: 'extra-rounded' as CornerStyle,
  cornerDot: 'dot' as CornerDotStyle,
  marginPercent: 8,
  ecl: 'Q' as EccLevel,
  logo: '',
  logoScale: 0.25,
  exportSize: 1024,
}

let links: LinkItem[] = []
let signedIn = false
let preview: QRCodeStyling | null = null

function showStatus(message: string, isError: boolean): void {
  statusBox.textContent = message
  statusBox.className = isError
    ? 'text-sm font-semibold text-red-700'
    : 'text-sm font-semibold text-green-800'
}

function currentMode(): Mode {
  const checked = document.querySelector<HTMLInputElement>('input[name="mode"]:checked')
  return checked?.value === 'static' ? 'static' : 'dynamic'
}

function readStaticInput(): PayloadInput {
  switch (staticType.value) {
    case 'text':
      return { kind: 'text', text: staticText.value }
    case 'wifi':
      return {
        kind: 'wifi',
        ssid: wifiSsid.value,
        password: wifiPassword.value,
        security: wifiSecurity.value === 'WEP' ? 'WEP' : wifiSecurity.value === 'nopass' ? 'nopass' : 'WPA',
        hidden: wifiHidden.checked,
      }
    case 'email':
      return { kind: 'email', to: emailTo.value, subject: emailSubject.value, body: emailBody.value }
    default:
      return { kind: 'url', url: staticUrl.value }
  }
}

type Current =
  | { ok: true; data: string; filename: string }
  | { ok: false; reason: string }

function currentPayload(): Current {
  if (currentMode() === 'dynamic') {
    if (!signedIn) {
      return {
        ok: false,
        reason: 'Sign in to make codes you can track and change later, or choose "Static" above.',
      }
    }
    const link = links.find((item) => String(item.id) === dynamicLink.value)
    if (!link) {
      return {
        ok: false,
        reason: links.length === 0 ? 'You have no links yet. Create one on the dashboard first.' : 'Choose one of your links.',
      }
    }
    return { ok: true, data: `${link.shortUrl}?s=q`, filename: `ph-ink-${link.slug}` }
  }

  const result = buildPayload(readStaticInput())
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, data: result.data, filename: 'ph-ink-qr' }
}

function readStyle(): void {
  style.dotStyle = dotStyleSelect.value as DotStyle
  style.cornerStyle = cornerStyleSelect.value as CornerStyle
  style.cornerDot = cornerDotSelect.value as CornerDotStyle
  style.dots = dotsPicker.value
  style.corners = cornersPicker.value
  style.background = backgroundPicker.value
  style.transparent = transparentBox.checked
  style.marginPercent = Number(marginRange.value)
  style.ecl = eclSelect.value as EccLevel
  style.logoScale = Number(logoScale.value)
  style.exportSize = Number(exportSize.value)

  marginLabel.textContent = `${style.marginPercent}%`
  logoScaleLabel.textContent = `${Math.round(style.logoScale * 100)}%`
}

function qrOptions(data: string, size: number, type: 'svg' | 'canvas'): QrOptions {
  const options: QrOptions = {
    width: size,
    height: size,
    type,
    data,
    margin: Math.round((size * style.marginPercent) / 100),
    qrOptions: { errorCorrectionLevel: style.ecl },
    dotsOptions: { color: style.dots, type: style.dotStyle },
    backgroundOptions: { color: style.transparent ? 'transparent' : style.background },
    cornersSquareOptions: { color: style.corners, type: style.cornerStyle },
    cornersDotOptions: { color: style.corners, type: style.cornerDot },
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: style.logoScale,
      margin: Math.round(size * 0.015),
      crossOrigin: 'anonymous',
    },
  }
  if (style.logo) options.image = style.logo
  return options
}

function scanChecks(payloadLength: number): Check[] {
  return checkScannability({
    dots: style.dots,
    corners: style.corners,
    background: style.background,
    transparent: style.transparent,
    hasLogo: style.logo !== '',
    logoScale: style.logoScale,
    ecl: style.ecl,
    marginPercent: style.marginPercent,
    payloadLength,
  })
}

function plural(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`
}

function renderChecks(checks: Check[]): void {
  checksList.replaceChildren(
    ...checks.map((check) => {
      const item = document.createElement('li')
      item.className = 'flex items-start gap-2 text-sm'
      const badge = document.createElement('span')
      badge.className = `shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${CHECK_STYLES[check.level]}`
      badge.textContent = CHECK_LABELS[check.level]
      const text = document.createElement('span')
      text.textContent = check.message
      item.append(badge, text)
      return item
    }),
  )
  const summary = summarizeChecks(checks)
  checkSummary.textContent =
    `${summary.passed} passed, ${plural(summary.warnings, 'warning')}, ${plural(summary.problems, 'problem')}`
}

function setButtons(enabled: boolean): void {
  downloadSvg.disabled = !enabled
  downloadPng.disabled = !enabled
  copySvg.disabled = !enabled
}

function showEmpty(reason: string): void {
  previewBox.replaceChildren()
  preview = null
  previewEmpty.textContent = reason
  previewEmpty.hidden = false
  checksList.replaceChildren()
  checkSummary.textContent = ''
  setButtons(false)
}

function drawPreview(data: string): void {
  previewEmpty.hidden = true
  const options = qrOptions(data, PREVIEW_SIZE, 'svg')
  if (!preview) {
    preview = new QRCodeStyling(options)
    preview.append(previewBox)
  } else {
    preview.update(options)
  }
}

function updateDynamicNote(): void {
  const link = links.find((item) => String(item.id) === dynamicLink.value)
  if (!link) {
    dynamicNote.textContent = ''
    return
  }
  dynamicNote.textContent =
    `Scans go to ${link.shortUrl}, which sends people to ${link.destination}. ` +
    (link.status === 'active'
      ? 'You can change the destination any time without reprinting the code.'
      : 'This link is paused, so scans will show a notice until you turn it on.')
}

function update(): void {
  readStyle()
  updateDynamicNote()
  const current = currentPayload()
  if (!current.ok) {
    showEmpty(current.reason)
    return
  }
  drawPreview(current.data)
  renderChecks(scanChecks(current.data.length))
  setButtons(true)
}

async function makeBlob(data: string, extension: 'png' | 'svg'): Promise<Blob> {
  const size = extension === 'svg' ? SVG_EXPORT_SIZE : style.exportSize
  const qr = new QRCodeStyling(qrOptions(data, size, extension === 'svg' ? 'svg' : 'canvas'))
  const raw = await qr.getRawData(extension)
  if (!(raw instanceof Blob)) throw new Error('Could not create the file.')
  return raw
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function confirmDespiteProblems(payloadLength: number): boolean {
  const summary = summarizeChecks(scanChecks(payloadLength))
  if (summary.problems === 0) return true
  return window.confirm('This design has scanning problems and may not work. Download anyway?')
}

async function download(extension: 'png' | 'svg'): Promise<void> {
  const current = currentPayload()
  if (!current.ok || !confirmDespiteProblems(current.data.length)) return
  setButtons(false)
  try {
    saveBlob(await makeBlob(current.data, extension), `${current.filename}.${extension}`)
    showStatus(`Downloaded the ${extension.toUpperCase()} file.`, false)
  } catch {
    showStatus('Could not create the file. Try a smaller size.', true)
  } finally {
    setButtons(true)
  }
}

async function copySvgCode(): Promise<void> {
  const current = currentPayload()
  if (!current.ok) return
  setButtons(false)
  try {
    const blob = await makeBlob(current.data, 'svg')
    await navigator.clipboard.writeText(await blob.text())
    showStatus('SVG code copied to the clipboard.', false)
  } catch {
    showStatus('Could not copy the code.', true)
  } finally {
    setButtons(true)
  }
}

function showStaticForm(): void {
  formUrl.hidden = staticType.value !== 'url'
  formText.hidden = staticType.value !== 'text'
  formWifi.hidden = staticType.value !== 'wifi'
  formEmail.hidden = staticType.value !== 'email'
}

function togglePanels(): void {
  const isDynamic = currentMode() === 'dynamic'
  dynamicPanel.hidden = !isDynamic
  staticPanel.hidden = isDynamic
}

function setColor(picker: HTMLInputElement, hex: HTMLInputElement, value: string): void {
  picker.value = value
  hex.value = value.toUpperCase()
}

function wireColor(picker: HTMLInputElement, hex: HTMLInputElement): void {
  picker.addEventListener('input', () => {
    hex.value = picker.value.toUpperCase()
    update()
  })
  hex.addEventListener('input', () => {
    const value = hex.value.trim()
    if (/^#[0-9a-f]{6}$/i.test(value)) {
      picker.value = value.toLowerCase()
      update()
    }
  })
}

function applyPreset(name: string): void {
  const preset = PRESETS[name]
  if (!preset) return
  setColor(dotsPicker, dotsHex, preset.dots)
  setColor(cornersPicker, cornersHex, preset.corners)
  setColor(backgroundPicker, backgroundHex, preset.background)
  transparentBox.checked = false
  dotStyleSelect.value = preset.dotStyle
  cornerStyleSelect.value = preset.cornerStyle
  cornerDotSelect.value = preset.cornerDot
  update()
}

function removeLogo(): void {
  style.logo = ''
  logoFile.value = ''
  logoControls.hidden = true
}

logoFile.addEventListener('change', () => {
  const file = logoFile.files?.[0]
  if (!file) return

  if (!LOGO_TYPES.includes(file.type)) {
    showStatus('Use a PNG, JPG or WebP image.', true)
    logoFile.value = ''
    return
  }
  if (file.size > MAX_LOGO_BYTES) {
    showStatus('That image is too large. Use one under 500 KB.', true)
    logoFile.value = ''
    return
  }

  const reader = new FileReader()
  reader.onload = () => {
    if (typeof reader.result !== 'string') return
    style.logo = reader.result
    eclSelect.value = 'H'
    logoControls.hidden = false
    showStatus('Logo added. Error correction was raised to High so the code can still be read.', false)
    update()
  }
  reader.onerror = () => showStatus('Could not read that image.', true)
  reader.readAsDataURL(file)
})

logoRemove.addEventListener('click', () => {
  removeLogo()
  showStatus('Logo removed.', false)
  update()
})

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="mode"]')) {
  radio.addEventListener('change', () => {
    togglePanels()
    update()
  })
}

staticType.addEventListener('change', showStaticForm)
wifiSecurity.addEventListener('change', () => {
  wifiPassword.disabled = wifiSecurity.value === 'nopass'
})

const watched: HTMLElement[] = [
  dynamicLink, staticType, staticUrl, staticText, wifiSsid, wifiPassword, wifiSecurity,
  wifiHidden, emailTo, emailSubject, emailBody, dotStyleSelect, cornerStyleSelect,
  cornerDotSelect, transparentBox, marginRange, eclSelect, logoScale, exportSize,
]
for (const control of watched) {
  control.addEventListener('input', update)
  control.addEventListener('change', update)
}

wireColor(dotsPicker, dotsHex)
wireColor(cornersPicker, cornersHex)
wireColor(backgroundPicker, backgroundHex)

for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-preset]')) {
  button.addEventListener('click', () => applyPreset(button.dataset.preset ?? ''))
}

downloadSvg.addEventListener('click', () => void download('svg'))
downloadPng.addEventListener('click', () => void download('png'))
copySvg.addEventListener('click', () => void copySvgCode())

async function init(): Promise<void> {
  try {
    const result = await listLinks()
    links = result.links.filter((link) => link.status !== 'blocked')
    signedIn = true
  } catch (error) {
    signedIn = false
    if (!(error instanceof ApiError && error.status === 401)) {
      showStatus('Could not load your links. You can still make static codes.', true)
    }
  }

  dynamicLink.replaceChildren(
    new Option(links.length > 0 ? 'Choose a link' : 'No links yet', ''),
    ...links.map((link) => new Option(`${link.title ?? link.slug}: ${link.shortUrl}`, String(link.id))),
  )

  const wanted = new URLSearchParams(window.location.search).get('link')
  if (wanted && links.some((link) => String(link.id) === wanted)) {
    dynamicLink.value = wanted
  }

  const mode: Mode = signedIn && links.length > 0 ? 'dynamic' : 'static'
  const radio = document.querySelector<HTMLInputElement>(`input[name="mode"][value="${mode}"]`)
  if (radio) radio.checked = true

  togglePanels()
  showStaticForm()
  update()
}

void init()