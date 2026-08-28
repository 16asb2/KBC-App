import { ATTEMPTS_COLOR, SENDS_COLOR } from '@/constants/chart'
import { KBC, tint } from '@/constants/theme'
import type { GradeBar, SetterTally } from '@/domain/summaries'

// Shared furniture for the two summary screens. Colour choices and their
// reasoning live in constants/chart.ts.

export function StatTile({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent: string
}) {
  return (
    // The figure wears ink, not the accent colour — the tint behind it carries
    // the identity, so the number stays legible whatever the accent is.
    <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: tint(accent) }}>
      <p className="text-[22px] leading-none font-extrabold text-neutral-900">{value}</p>
      <p className="mt-1.5 text-[10px] leading-tight font-semibold text-neutral-500">{label}</p>
    </div>
  )
}

export function Card({
  title,
  note,
  children,
}: {
  title: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="mt-4 rounded-2xl border border-neutral-200 p-4">
      <h3 className="text-sm font-bold text-neutral-900">{title}</h3>
      {children}
      {note && <p className="mt-2 text-[10px] text-neutral-400">{note}</p>}
    </section>
  )
}

export function SendsLegend() {
  return (
    <div className="mt-1 flex items-center gap-4">
      {[
        { color: SENDS_COLOR, label: 'Sends' },
        { color: ATTEMPTS_COLOR, label: 'Attempts' },
      ].map((s) => (
        <span key={s.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
          <span className="text-[11px] font-medium text-neutral-500">{s.label}</span>
        </span>
      ))}
    </div>
  )
}

const PLOT_H = 150

/**
 * Climbs per grade, sends stacked on attempts.
 *
 * The container is sized to the plot *plus* the label band beneath it, so the
 * grade names are never cut off into a nested scrollbar. Bars scroll sideways
 * when a scale has more grades than fit.
 */
export function GradeBarChart({ bars }: { bars: GradeBar[] }) {
  const max = Math.max(...bars.map((b) => b.sends + b.attempts), 1)
  // Four gridlines including the baseline: enough to read against, few enough
  // to stay recessive.
  const ticks = [0, 0.5, 1].map((f) => ({ frac: f, value: Math.round(f * max) }))

  return (
    <div className="mt-3 flex gap-2">
      <div className="relative w-6 shrink-0" style={{ height: PLOT_H }}>
        {ticks.map((t) => (
          <span
            key={t.frac}
            className="absolute right-0 -translate-y-1/2 text-[10px] text-neutral-400 tabular-nums"
            style={{ top: PLOT_H - t.frac * PLOT_H }}
          >
            {t.value}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <div className="relative" style={{ height: PLOT_H }}>
          {ticks.map((t) => (
            <div
              key={t.frac}
              aria-hidden
              className="absolute right-0 left-0 border-t border-neutral-100"
              style={{ top: PLOT_H - t.frac * PLOT_H }}
            />
          ))}

          <div className="absolute inset-0 flex items-end gap-2">
            {bars.map((b) => {
              const total = b.sends + b.attempts
              return (
                <div key={b.grade} className="flex w-11 shrink-0 flex-col items-center justify-end">
                  <span className="mb-1 text-[10px] font-bold text-neutral-600 tabular-nums">
                    {total}
                  </span>
                  <div
                    className="flex w-full flex-col justify-end overflow-hidden rounded-t"
                    style={{ height: (total / max) * (PLOT_H - 18) }}
                    title={`${b.grade}: ${b.sends} sent, ${b.attempts} attempted`}
                  >
                    {/* Attempts sit under sends, with a 2px surface gap between
                        them rather than a border, so the split is legible even
                        where the two blocks are similar in size. */}
                    {b.attempts > 0 && (
                      <div
                        className="w-full shrink-0"
                        style={{
                          height: `${(b.attempts / total) * 100}%`,
                          backgroundColor: ATTEMPTS_COLOR,
                          marginTop: b.sends > 0 ? 2 : 0,
                          order: 2,
                        }}
                      />
                    )}
                    {b.sends > 0 && (
                      <div
                        className="w-full shrink-0 rounded-t"
                        style={{
                          height: `${(b.sends / total) * 100}%`,
                          backgroundColor: SENDS_COLOR,
                          order: 1,
                        }}
                      />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Axis band, outside the fixed plot height. */}
        <div className="flex gap-2 pt-1.5">
          {bars.map((b) => (
            <span
              key={b.grade}
              className="w-11 shrink-0 text-center text-[10px] leading-tight font-medium break-words text-neutral-600"
            >
              {b.grade}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * Who set how much — one hue for every bar.
 *
 * Setters are nominal: there is no order in "Artur, Bea, Chris" that a colour
 * could carry, so giving each its own hue would spend the identity channel
 * re-encoding the bar length. mobile did exactly that, cycling a 15-colour
 * list. One hue, ranked, with the count and share written out.
 */
export function SetterBars({ rows }: { rows: SetterTally[] }) {
  const max = Math.max(...rows.map((r) => r.count), 1)
  return (
    <ul className="mt-3 space-y-2">
      {rows.map((r) => (
        <li key={r.name} className="flex items-center gap-2.5">
          <span
            className="w-20 shrink-0 truncate text-xs font-semibold text-neutral-700"
            title={r.name}
          >
            {r.name}
          </span>
          <span className="h-2 min-w-0 flex-1 rounded-full bg-neutral-100">
            <span
              className="block h-full rounded-full"
              style={{ width: `${(r.count / max) * 100}%`, backgroundColor: KBC.cyan }}
            />
          </span>
          <span className="w-6 shrink-0 text-right text-xs font-bold text-neutral-700 tabular-nums">
            {r.count}
          </span>
          <span className="w-9 shrink-0 text-right text-[11px] text-neutral-400 tabular-nums">
            {r.percent}%
          </span>
        </li>
      ))}
    </ul>
  )
}
