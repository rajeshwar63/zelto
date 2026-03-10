import { useState } from 'react'

interface AdminLoginProps {
  onLoginSuccess: (username: string) => void
}

export function AdminLogin({ onLoginSuccess }: AdminLoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function handleLogin() {
    // Temporary: admin credentials validated locally
    // TODO: Replace with Supabase Edge Function or server-side auth
    const ADMIN_USER = import.meta.env.VITE_ADMIN_USERNAME || 'zelto-admin'
    const ADMIN_PASS = import.meta.env.VITE_ADMIN_PASSWORD || ''

    if (username === ADMIN_USER && password === ADMIN_PASS) {
      onLoginSuccess(username)
    } else {
      setError('Invalid username or password')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', backgroundColor: '#fff' }}>
      <div style={{ width: 320, padding: 32 }}>
        <h2 style={{ marginBottom: 24, fontSize: 20, fontWeight: 600, color: '#1A1A2E' }}>Zelto Admin</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={e => setUsername(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', marginBottom: 12, border: '1px solid #ccc', borderRadius: 4, fontSize: 14, boxSizing: 'border-box' }}
        />
        {error && (
          <p style={{ color: 'var(--status-overdue)', fontSize: 13, marginBottom: 12 }}>{error}</p>
        )}
        <button
          onClick={handleLogin}
          style={{ width: '100%', padding: '10px 12px', backgroundColor: '#1A1A2E', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}
        >
          Login
        </button>
      </div>
    </div>
  )
}