import QRCodeStyling from 'qr-code-styling'
import {
  ApiError,
  createLink,
  getQrStyle,
  listLinks,
  resetQrStyle,
  saveQrStyle,
  type LinkItem,
  type SavedQrStyle,
} from './api'
import { buildPayload, type PayloadInput } from './qr/payload'
import { checkScannability, summarizeChecks, type Check, type EccLevel } from './qr/scannability'

type QrOptions = NonNullable<ConstructorParameters<typeof QRCodeStyling>[0]>
type ContentType = 'url' | 'text' | 'wifi' | 'email'
type UrlMode = 'static' | 'new' | 'existing'
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

const DEFAULT_STYLE: SavedQrStyle = {
  dots: '#09090b',
  corners: '#18181b',
  background: '#ffffff',
  transparent: false,
  dotStyle: 'rounded',
  cornerStyle: 'extra-rounded',
  cornerDot: 'dot',
  marginPercent: 8,
  ecl: 'Q',
  logoScale: 0.25,
  exportSize: 1024,
}

const PREVIEW_SIZE = 300
const SVG_EXPORT_SIZE = 1024
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_LOGO_BYTES = 500 * 1024
const SIGN_IN_REASON =
  'Tracked codes need a free account. Sign in, or choose "Plain code, no tracking".'

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

const panelUrl = byId<HTMLElement>('panel-url')
const signinNote = byId<HTMLElement>('signin-note')
const createdBox = byId<HTMLElement>('created-box')
const createdText = byId<HTMLElement>('created-text')
const createdCopy = byId<HTMLButtonElement>('created-copy')
const createdAnother = byId<HTMLButtonElement>('created-another')
const urlNew = byId<HTMLElement>('url-new')
const newDestination = byId<HTMLInputElement>('new-destination')
const newSlug = byId<HTMLInputElement>('new-slug')
const newTitle = byId<HTMLInputElement>('new-title')
const createButton = byId<HTMLButtonElement>('create-button')
const urlExisting = byId<HTMLElement>('url-existing')
const dynamicLink = byId<HTMLSelectElement>('dynamic-link')
const dynamicNote = byId<HTMLElement>('dynamic-note')
const savedControls = byId<HTMLElement>('saved-style-controls')
const savedNote = byId<HTMLElement>('saved-style-note')
const saveStyleButton = byId<HTMLButtonElement>('save-style')
const resetStyleButton = byId<HTMLButtonElement>('reset-style')
const urlStatic = byId<HTMLElement>('url-static')
const staticUrl = byId<HTMLInputElement>('static-url')
const formText = byId<HTMLElement>('form-text')
const staticText = byId<HTMLTextAreaElement>('static-text')
const formWifi = byId<HTMLElement>('form-wifi')
const wifiSsid = byId<HTMLInputElement>('wifi-ssid')
const wifiPassword = byId<HTMLInputElement>('wifi-password')
const wifiSecurity = byId<HTMLSelectElement>('wifi-security')
const wifiHidden = byId<HTMLInputElement>('wifi-hidden')
const formEmail = byId<HTMLElement>('form-email')
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
const previewNote = byId<HTMLElement>('preview-note')
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
let lastCreated: LinkItem | null = null
let styleRequest = 0

function showStatus(message: string, isError: boolean): void {
  statusBox.textContent = message
  statusBox.className = isError
    ? 'text-sm font-semibold text-red-700'
    : 'text-sm font-semibold text-green-800'
}

function contentType(): ContentType {
  const checked = document.querySelector<HTMLInputElement>('input[name="ctype"]:checked')
  const value = checked?.value
  return value === 'text' || value === 'wifi' || value === 'email' ? value : 'url'
}

function urlMode(): UrlMode {
  const checked = document.querySelector<HTMLInputElement>('input[name="urlmode"]:checked')
  const value = checked?.value
  return value === 'new' || value === 'existing' ? value : 'static'
}

function setRadio(name: string, value: string): void {
  const radio = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`)
  if (radio) radio.checked = true
}

function readInput(type: Exclude<ContentType, 'url'>): PayloadInput {
  switch (type) {
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
  }
}

function placeholderLink(): string {
  const wanted = newSlug.value.trim()
  const slug = /^[A-Za-z0-9_-]{3,32}$/.test(wanted) ? wanted : 'abcdef'
  return `${window.location.origin}/${slug}?s=q`
}

type Current =
  | { ok: true; data: string; filename: string; downloadable: boolean; placeholder: boolean }
  | { ok: false; reason: string }

function currentPayload(): Current {
  const type = contentType()

  if (type === 'url') {
    const mode = urlMode()

    if (mode === 'static') {
      const result = buildPayload({ kind: 'url', url: staticUrl.value })
      if (!result.ok) return { ok: false, reason: result.reason }
      return { ok: true, data: result.data, filename: 'phub-ink-qr', downloadable: true, placeholder: false }
    }

    if (!signedIn) return { ok: false, reason: SIGN_IN_REASON }

    if (mode === 'new') {
      if (newDestination.value.trim() === '') {
        return { ok: false, reason: 'Enter the link you want the code to lead to.' }
      }
      const result = buildPayload({ kind: 'url', url: newDestination.value })
      if (!result.ok) return { ok: false, reason: result.reason }
      return { ok: true, data: placeholderLink(), filename: 'phub-ink-qr', downloadable: false, placeholder: true }
    }

    const link = links.find((item) => String(item.id) === dynamicLink.value)
    if (!link) {
      return {
        ok: false,
        reason:
          links.length === 0
            ? 'You have no links yet. Choose "Create a tracked link" to make one.'
            : 'Choose one of your links.',
      }
    }
    return {
      ok: true,
      data: `${link.shortUrl}?s=q`,
      filename: `phub-ink-${link.slug}`,
      downloadable: true,
      placeholder: false,
    }
  }

  const result = buildPayload(readInput(type))
  if (!result.ok) return { ok: false, reason: result.reason }
  return { ok: true, data: result.data, filename: 'phub-ink-qr', downloadable: true, placeholder: false }
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

function setDownloads(enabled: boolean): void {
  downloadSvg.disabled = !enabled
  downloadPng.disabled = !enabled
  copySvg.disabled = !enabled
}

function showEmpty(reason: string): void {
  previewBox.replaceChildren()
  preview = null
  previewEmpty.textContent = reason
  previewEmpty.hidden = false
  previewNote.hidden = true
  checksList.replaceChildren()
  checkSummary.textContent = ''
  setDownloads(false)
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

function refreshCreatedBox(): void {
  const visible =
    lastCreated !== null &&
    contentType() === 'url' &&
    urlMode() === 'existing' &&
    dynamicLink.value === String(lastCreated.id)
  createdBox.hidden = !visible
  if (visible && lastCreated) createdText.textContent = lastCreated.shortUrl
}

function togglePanels(): void {
  const type = contentType()
  const mode = urlMode()
  panelUrl.hidden = type !== 'url'
  formText.hidden = type !== 'text'
  formWifi.hidden = type !== 'wifi'
  formEmail.hidden = type !== 'email'
  urlNew.hidden = mode !== 'new'
  urlExisting.hidden = mode !== 'existing'
  urlStatic.hidden = mode !== 'static'
  signinNote.hidden = signedIn || mode === 'static'
}

function update(): void {
  readStyle()
  updateDynamicNote()
  refreshCreatedBox()

  const current = currentPayload()
  if (!current.ok) {
    showEmpty(current.reason)
    return
  }
  drawPreview(current.data)
  renderChecks(scanChecks(current.data.length))
  setDownloads(current.downloadable)
  previewNote.hidden = !current.placeholder
}

// ---------- Exporting ----------

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
  if (!current.ok || !current.downloadable || !confirmDespiteProblems(current.data.length)) return
  setDownloads(false)
  try {
    saveBlob(await makeBlob(current.data, extension), `${current.filename}.${extension}`)
    showStatus(`Downloaded the ${extension.toUpperCase()} file.`, false)
  } catch {
    showStatus('Could not create the file. Try a smaller size.', true)
  } finally {
    update()
  }
}

async function copySvgCode(): Promise<void> {
  const current = currentPayload()
  if (!current.ok || !current.downloadable) return
  setDownloads(false)
  try {
    const blob = await makeBlob(current.data, 'svg')
    await navigator.clipboard.writeText(await blob.text())
    showStatus('SVG code copied to the clipboard.', false)
  } catch {
    showStatus('Could not copy the code.', true)
  } finally {
    update()
  }
}

// ---------- Colours and presets ----------

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

// ---------- Logo ----------

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

// ---------- Saved styles (for tracked links) ----------

function selectedLinkId(): number | null {
  if (!signedIn || contentType() !== 'url' || urlMode() !== 'existing') return null
  const id = Number(dynamicLink.value)
  return Number.isInteger(id) && id > 0 ? id : null
}

function collectStyle(): SavedQrStyle {
  readStyle()
  return {
    dots: style.dots,
    corners: style.corners,
    background: style.background,
    transparent: style.transparent,
    dotStyle: style.dotStyle,
    cornerStyle: style.cornerStyle,
    cornerDot: style.cornerDot,
    marginPercent: style.marginPercent,
    ecl: style.ecl,
    logoScale: style.logoScale,
    exportSize: style.exportSize,
  }
}

function applyStyle(saved: SavedQrStyle): void {
  setColor(dotsPicker, dotsHex, saved.dots)
  setColor(cornersPicker, cornersHex, saved.corners)
  setColor(backgroundPicker, backgroundHex, saved.background)
  transparentBox.checked = saved.transparent
  dotStyleSelect.value = saved.dotStyle
  cornerStyleSelect.value = saved.cornerStyle
  cornerDotSelect.value = saved.cornerDot
  marginRange.value = String(saved.marginPercent)
  eclSelect.value = saved.ecl
  logoScale.value = String(saved.logoScale)
  exportSize.value = String(saved.exportSize)
}

function styleError(error: unknown, fallback: string): void {
  showStatus(error instanceof ApiError ? error.message : fallback, true)
}

async function loadSavedStyle(): Promise<void> {
  const id = selectedLinkId()
  savedControls.hidden = id === null
  savedNote.textContent = ''
  if (id === null) return

  const mine = ++styleRequest
  try {
    const result = await getQrStyle(id)
    if (mine !== styleRequest) return
    if (result.style) {
      applyStyle(result.style)
      savedNote.textContent = 'Loaded the style you saved for this link.'
    } else {
      applyStyle(DEFAULT_STYLE)
      savedNote.textContent = 'No saved style for this link yet, so the default style is shown.'
    }
  } catch (error) {
    if (mine !== styleRequest) return
    styleError(error, 'Could not load the saved style.')
  }
}

saveStyleButton.addEventListener('click', () => {
  const id = selectedLinkId()
  if (id === null) return
  saveStyleButton.disabled = true
  void saveQrStyle(id, collectStyle())
    .then(() => {
      savedNote.textContent = 'Saved. This style will load whenever you open this link.'
      showStatus('Style saved.', false)
    })
    .catch((error: unknown) => styleError(error, 'Could not save the style.'))
    .finally(() => {
      saveStyleButton.disabled = false
    })
})

resetStyleButton.addEventListener('click', () => {
  const id = selectedLinkId()
  if (id === null) return
  resetStyleButton.disabled = true
  void resetQrStyle(id)
    .then(() => {
      applyStyle(DEFAULT_STYLE)
      savedNote.textContent = 'Reset. This link now uses the default style.'
      showStatus('Style reset.', false)
      update()
    })
    .catch((error: unknown) => styleError(error, 'Could not reset the style.'))
    .finally(() => {
      resetStyleButton.disabled = false
    })
})

// ---------- Creating a tracked link from here ----------

function fillLinkOptions(selected: string): void {
  const options = [new Option(links.length > 0 ? 'Choose a link' : 'No links yet', '')]
  for (const link of links) {
    options.push(new Option(`${link.title ?? link.slug}: ${link.shortUrl}`, String(link.id)))
  }
  dynamicLink.replaceChildren(...options)
  if (selected !== '' && links.some((link) => String(link.id) === selected)) {
    dynamicLink.value = selected
  }
}

async function createTracked(): Promise<void> {
  const check = buildPayload({ kind: 'url', url: newDestination.value })
  if (!check.ok) {
    showStatus(check.reason, true)
    newDestination.focus()
    return
  }

  createButton.disabled = true
  try {
    const link = await createLink({
      destination: check.data,
      slug: newSlug.value.trim(),
      title: newTitle.value.trim(),
    })

    lastCreated = link
    links = [link, ...links.filter((item) => item.id !== link.id)]
    fillLinkOptions(String(link.id))
    newDestination.value = ''
    newSlug.value = ''
    newTitle.value = ''

    setRadio('urlmode', 'existing')
    togglePanels()
    savedControls.hidden = false
    savedNote.textContent =
      'This link has no saved style yet. Press "Save this style for this link" to keep the look you chose.'
    showStatus('Link created and saved to your dashboard. Your code is ready to download.', false)
    update()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      signedIn = false
      togglePanels()
      update()
      showStatus('Your session ended. Please sign in again.', true)
    } else {
      showStatus(
        error instanceof ApiError ? error.message : 'Could not reach the server. Please try again.',
        true,
      )
    }
  } finally {
    createButton.disabled = false
  }
}

createButton.addEventListener('click', () => void createTracked())

createdCopy.addEventListener('click', () => {
  if (!lastCreated) return
  void navigator.clipboard
    .writeText(lastCreated.shortUrl)
    .then(() => showStatus('Short link copied.', false))
    .catch(() => showStatus('Could not copy. Select the address and copy it by hand.', true))
})

createdAnother.addEventListener('click', () => {
  lastCreated = null
  setRadio('urlmode', 'new')
  togglePanels()
  savedControls.hidden = true
  savedNote.textContent = ''
  update()
  newDestination.focus()
})

// ---------- Wiring ----------

for (const radio of document.querySelectorAll<HTMLInputElement>('input[name="ctype"], input[name="urlmode"]')) {
  radio.addEventListener('change', () => {
    togglePanels()
    void loadSavedStyle().then(update)
  })
}

dynamicLink.addEventListener('change', () => {
  void loadSavedStyle().then(update)
})

wifiSecurity.addEventListener('change', () => {
  wifiPassword.disabled = wifiSecurity.value === 'nopass'
})

const watched: HTMLElement[] = [
  newDestination, newSlug, newTitle, staticUrl, staticText, wifiSsid, wifiPassword,
  wifiSecurity, wifiHidden, emailTo, emailSubject, emailBody, dotStyleSelect,
  cornerStyleSelect, cornerDotSelect, transparentBox, marginRange, eclSelect, logoScale,
  exportSize,
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

// ---------- Start ----------

async function init(): Promise<void> {
  try {
    const result = await listLinks()
    links = result.links.filter((link) => link.status !== 'blocked')
    signedIn = true
  } catch (error) {
    signedIn = false
    if (!(error instanceof ApiError && error.status === 401)) {
      showStatus('Could not load your links. You can still make plain codes.', true)
    }
  }

  fillLinkOptions('')

  let mode: UrlMode = signedIn ? 'new' : 'static'
  const wanted = new URLSearchParams(window.location.search).get('link')
  if (wanted && links.some((link) => String(link.id) === wanted)) {
    dynamicLink.value = wanted
    mode = 'existing'
  }
  setRadio('urlmode', mode)

  togglePanels()
  await loadSavedStyle()
  update()
}

void init()