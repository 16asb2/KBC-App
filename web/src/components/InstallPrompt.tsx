import { useEffect, useState } from 'react'
import { KBC } from '@/constants/theme'

const DISMISSED_KEY = 'kbc-install-prompt-dismissed'

function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari's non-standard flag — no matchMedia equivalent there.
    (navigator as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/**
 * iOS gives no install-prompt API at all — Add to Home Screen is a manual
 * Share-sheet action, so the only "install button" possible there is
 * instructions. Android/desktop Chromium browsers fire beforeinstallprompt,
 * which we capture and defer so a real button can trigger it on demand
 * (browsers require a user gesture, so it can't be called immediately).
 */
export function InstallPrompt() {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === 'true')
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  if (dismissed || isStandalone()) return null

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, 'true')
    setDismissed(true)
  }

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setDeferredPrompt(null)
  }

  if (!isIos() && !deferredPrompt) return null

  return (
    <div className="flex items-start gap-3 border-b border-neutral-800 px-4 py-2.5" style={{ backgroundColor: KBC.darkGrey }}>
      <div className="min-w-0 flex-1">
        {isIos() ? (
          <p className="text-xs text-neutral-300">
            Install this app: tap <span className="font-semibold text-white">Share</span> (⬆️) then{' '}
            <span className="font-semibold text-white">Add to Home Screen</span>.
          </p>
        ) : (
          <p className="text-xs text-neutral-300">Install the KBC app for quicker access and offline loading.</p>
        )}
      </div>
      {!isIos() && deferredPrompt && (
        <button
          type="button"
          onClick={() => void install()}
          className="shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold text-black"
          style={{ backgroundColor: KBC.cyan }}
        >
          Install
        </button>
      )}
      <button type="button" onClick={dismiss} className="shrink-0 text-sm text-neutral-500">
        ✕
      </button>
    </div>
  )
}
