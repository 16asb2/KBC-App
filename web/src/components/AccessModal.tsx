import { useState } from 'react'
import { KBC } from '@/constants/theme'
import { ACCESS_OPTIONS, type AccessOption } from '@/services/logbook'
import { Modal } from './Modal'

type ModalStep = 'choose' | 'confirm'

// Ported from mobile/app/(tabs)/home.tsx's AccessModal. Self-service only for
// now — the supervisor-only "use another member's punch" option isn't ported
// (needs the member directory/other-climber flows, deferred like the rest of
// supervisor-assisted sign-in).
export function AccessModal({
  onComplete,
  onClose,
}: {
  onComplete: (option: AccessOption, voucherCode?: string) => void
  onClose: () => void
}) {
  const [step, setStep] = useState<ModalStep>('choose')
  const [selected, setSelected] = useState<AccessOption | null>(null)
  const [voucherNumber, setVoucherNumber] = useState('')

  function handleChoose(opt: AccessOption) {
    setSelected(opt)
    setVoucherNumber('')
    setStep('confirm')
  }

  function handleDone() {
    if (!selected) return
    if (selected.isVoucher && !voucherNumber.trim()) return
    onComplete(selected, selected.isVoucher ? voucherNumber.trim() : undefined)
  }

  return (
    <Modal onClose={onClose}>
      {step === 'choose' && (
        <>
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-base font-bold text-black">How are you accessing KBC?</h2>
            <button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: KBC.pink }}>
              Cancel
            </button>
          </div>
          <div className="divide-y divide-neutral-100">
            {ACCESS_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleChoose(opt)}
                className="flex w-full items-center justify-between py-3 text-left"
              >
                <span>
                  <span className="block font-semibold text-black">{opt.label}</span>
                  {opt.detail && <span className="block text-xs text-neutral-500">{opt.detail}</span>}
                </span>
                <span className="font-bold text-black">{opt.price}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'confirm' && selected && (
        <>
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-base font-bold text-black">
              {selected.isVoucher ? 'Redeem Voucher' : 'Confirm Payment'}
            </h2>
            <button
              type="button"
              onClick={() => setStep('choose')}
              className="text-sm font-semibold"
              style={{ color: KBC.pink }}
            >
              Back
            </button>
          </div>
          <div className="rounded-xl bg-neutral-50 p-4">
            <p className="font-bold text-black">{selected.label}</p>
            {!selected.isVoucher && <p className="text-sm text-neutral-600">{selected.price}</p>}
            {selected.detail && <p className="mt-1 text-xs text-neutral-500">{selected.detail}</p>}
          </div>

          {selected.isVoucher ? (
            <>
              <p className="mt-4 text-sm text-neutral-600">Enter your voucher number:</p>
              <input
                className="kbc-input mt-1"
                value={voucherNumber}
                onChange={(e) => setVoucherNumber(e.target.value)}
                placeholder="Voucher number…"
                autoFocus
              />
              <button
                type="button"
                onClick={handleDone}
                disabled={!voucherNumber.trim()}
                className="mt-4 w-full rounded-xl p-3 font-bold text-white disabled:opacity-40"
                style={{ backgroundColor: KBC.green }}
              >
                Redeem Voucher
              </button>
            </>
          ) : (
            <>
              <p className="mt-4 text-sm text-neutral-600">
                Please pay the supervisor on duty in cash, or e-transfer the amount to{' '}
                <span className="font-semibold" style={{ color: KBC.cyan }}>
                  climb.kbc@gmail.com
                </span>
              </p>
              <button
                type="button"
                onClick={handleDone}
                className="mt-4 w-full rounded-xl p-3 font-bold text-white"
                style={{ backgroundColor: KBC.green }}
              >
                I&apos;ve paid and confirmed with the supervisor
              </button>
            </>
          )}
        </>
      )}
    </Modal>
  )
}
