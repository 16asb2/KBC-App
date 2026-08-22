export function PagePlaceholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-full items-center justify-center p-8">
      <div className="text-center">
        <h1 className="text-xl font-bold text-neutral-800">{title}</h1>
        <p className="mt-1 text-sm text-neutral-500">Coming in a later migration phase.</p>
      </div>
    </div>
  )
}
