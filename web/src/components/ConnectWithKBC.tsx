import { useEffect, useState } from 'react'
import { KBC } from '@/constants/theme'

// Ported from the "Connect with KBC" block at the foot of
// mobile@1cdfada/app/(tabs)/home.tsx. Same three destinations and the same
// brand colours; the email differs in what a tap does — mobile opened a
// `mailto:`, which on a desktop browser means whatever mail client the machine
// happens to have registered, often none. Copying it to the clipboard works
// everywhere and is what you wanted anyway when e-transferring a membership.

const KBC_EMAIL = 'climb.kbc@gmail.com'

type Social = { name: string; href: string; color: string; path: string }

// Brand marks, 24×24. Inline rather than from an icon package: three glyphs
// is not worth a dependency, and the app already hand-rolls its nav icons.
const SOCIALS: Social[] = [
  {
    name: 'Discord',
    href: 'https://discord.gg/h8PaBftpBu',
    color: '#5865F2',
    path: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
  },
  {
    name: 'Facebook',
    // Trailing slash: this is the canonical form Facebook serves, and going
    // straight to it avoids a redirect hop — which is one of the places the
    // hand-off to the Facebook app can fall over.
    href: 'https://www.facebook.com/kingstonboulderingcoop/',
    color: '#1877F2',
    path: 'M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z',
  },
  {
    name: 'Instagram',
    href: 'https://www.instagram.com/kingstonboulderingcoop/',
    color: '#E1306C',
    path: 'M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405a1.441 1.441 0 01-2.88 0 1.44 1.44 0 012.88 0z',
  },
]

/**
 * Copy text, falling back to the old selection trick.
 *
 * `navigator.clipboard` needs a secure context. The deployed app is HTTPS so it
 * is there in practice, but a dev server reached over the LAN by IP is not, and
 * that is exactly where someone would be testing this.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(el)
    return ok
  } catch {
    return false
  }
}

/**
 * Open a social link out of the app rather than inside it.
 *
 * An installed PWA in standalone display mode ignores `target="_blank"` on
 * iOS — the tap does nothing at all. Instagram and Discord get away with it
 * because their apps claim those URLs as universal links, so the OS intercepts
 * before the browser has to care; Facebook does not reliably claim `/vanity`
 * Page URLs, which is why that one is the link that appears broken.
 *
 * `window.open` does escape a standalone PWA, so it is tried first. If it is
 * blocked and returns null, the click is left alone and the anchor's own
 * `target="_blank"` takes over — which is what works everywhere else.
 */
function openExternally(e: React.MouseEvent<HTMLAnchorElement>) {
  const opened = window.open(e.currentTarget.href, '_blank', 'noopener,noreferrer')
  if (opened) e.preventDefault()
}

export function ConnectWithKBC() {
  const [copied, setCopied] = useState<'idle' | 'done' | 'failed'>('idle')

  useEffect(() => {
    if (copied === 'idle') return
    const t = setTimeout(() => setCopied('idle'), 2500)
    return () => clearTimeout(t)
  }, [copied])

  async function handleCopy() {
    setCopied((await copyText(KBC_EMAIL)) ? 'done' : 'failed')
  }

  return (
    <section className="pt-2">
      <h2 className="mb-2.5 ml-0.5 text-xs font-extrabold tracking-wider text-neutral-400 uppercase">
        Connect with KBC
      </h2>

      <div className="flex gap-2.5">
        {SOCIALS.map((s) => (
          <a
            key={s.name}
            href={s.href}
            target="_blank"
            // noreferrer as well as noopener: without it the opened tab gets a
            // Referer naming this app, and on older browsers window.opener too.
            rel="noopener noreferrer"
            onClick={openExternally}
            aria-label={`KBC on ${s.name}`}
            title={`KBC on ${s.name}`}
            className="flex h-13 flex-1 items-center justify-center rounded-xl transition-opacity hover:opacity-85"
            style={{ backgroundColor: s.color }}
          >
            <svg viewBox="0 0 24 24" fill="#fff" className="size-7" aria-hidden focusable="false">
              <path d={s.path} />
            </svg>
          </a>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void handleCopy()}
        className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-xl p-3.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
        style={{ backgroundColor: KBC.darkGrey }}
        title="Copy the KBC email address"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="#fff"
          strokeWidth={2}
          className="size-4"
          aria-hidden
        >
          <rect x="2" y="4" width="20" height="16" rx="2" />
          <path d="m2 7 10 6 10-6" />
        </svg>
        <span>
          {copied === 'done'
            ? 'Copied to clipboard!'
            : copied === 'failed'
              ? 'Copy failed — select it manually'
              : KBC_EMAIL}
        </span>
      </button>
      {/* aria-live so the confirmation is announced, not just shown — the label
          itself changing would otherwise be silent to a screen reader. */}
      <span aria-live="polite" className="sr-only">
        {copied === 'done' ? `${KBC_EMAIL} copied to clipboard` : ''}
      </span>
    </section>
  )
}
