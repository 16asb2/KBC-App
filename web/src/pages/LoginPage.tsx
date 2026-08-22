import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { KBC } from '@/constants/theme'

export function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [signingIn, setSigningIn] = useState(false)

  if (!loading && user) return <Navigate to="/" replace />

  async function handleSignIn() {
    setError(null)
    setSigningIn(true)
    try {
      await signInWithGoogle()
    } catch (e) {
      console.warn('Sign-in error:', e)
      setError('Sign-in failed. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  return (
    <div
      className="flex min-h-svh flex-col items-center justify-center gap-6 px-6 text-center"
      style={{ backgroundColor: KBC.black }}
    >
      <img src="/kbc-logo.png" alt="" className="size-20 rounded-2xl" />
      <div>
        <h1 className="text-2xl font-bold text-white">KBC App</h1>
        <p className="mt-1 text-sm text-neutral-400">Kingston Boulder Cooperative</p>
      </div>
      <button
        type="button"
        onClick={() => void handleSignIn()}
        disabled={signingIn || loading}
        className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-neutral-900 disabled:opacity-60"
      >
        {signingIn ? 'Signing in…' : 'Sign in with Google'}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  )
}
