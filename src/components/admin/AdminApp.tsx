import { useEffect, useState } from 'react'
import { AdminLogin } from './AdminLogin'
import { EntitiesSection } from './EntitiesSection'
import { ConnectionsSection } from './ConnectionsSection'
import { FlagsSection } from './FlagsSection'
import { SystemSection } from './SystemSection'
import { Button } from '@/components/ui/button'
import { dataStore } from '@/lib/data-store'

type Section = 'entities' | 'connections' | 'flags' | 'system'

const ADMIN_SESSION_KEY = 'zelto:admin-session'
const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

interface AdminSession {
  username: string
  expiresAt: number
}

function getStoredAdminSession(): string | null {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) return null
    const session: AdminSession = JSON.parse(raw)
    if (Date.now() > session.expiresAt) {
      localStorage.removeItem(ADMIN_SESSION_KEY)
      return null
    }
    return session.username
  } catch {
    return null
  }
}

function storeAdminSession(username: string): void {
  const session: AdminSession = { username, expiresAt: Date.now() + ADMIN_SESSION_TTL_MS }
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
}

function clearAdminSession(): void {
  localStorage.removeItem(ADMIN_SESSION_KEY)
}

export function AdminApp() {
  const [loggedInAdmin, setLoggedInAdmin] = useState<string | null>(() => getStoredAdminSession())
  const [currentSection, setCurrentSection] = useState<Section>('entities')

  useEffect(() => {
    ensureAdminAccountExists()
  }, [])

  const ensureAdminAccountExists = async () => {
    const existingAdmin = await dataStore.getAdminAccountByUsername('zelto-admin')
    if (!existingAdmin) {
      await dataStore.createAdminAccount('zelto-admin', 'admin2026')
    }
  }

  const handleLoginSuccess = (username: string) => {
    storeAdminSession(username)
    setLoggedInAdmin(username)
  }

  const handleLogout = () => {
    clearAdminSession()
    setLoggedInAdmin(null)
    setCurrentSection('entities')
  }

  if (!loggedInAdmin) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Zelto Admin</h1>
            <p className="text-xs text-gray-500">Logged in as {loggedInAdmin}</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleLogout}>
            Logout
          </Button>
        </div>

        <div className="max-w-7xl mx-auto px-6">
          <nav className="flex space-x-8 -mb-px">
            <button
              onClick={() => setCurrentSection('entities')}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                currentSection === 'entities'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Entities
            </button>
            <button
              onClick={() => setCurrentSection('connections')}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                currentSection === 'connections'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Connections
            </button>
            <button
              onClick={() => setCurrentSection('flags')}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                currentSection === 'flags'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Flags
            </button>
            <button
              onClick={() => setCurrentSection('system')}
              className={`py-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                currentSection === 'system'
                  ? 'border-gray-900 text-gray-900'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              System
            </button>
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {currentSection === 'entities' && <EntitiesSection />}
        {currentSection === 'connections' && <ConnectionsSection />}
        {currentSection === 'flags' && <FlagsSection adminUsername={loggedInAdmin} />}
        {currentSection === 'system' && <SystemSection adminUsername={loggedInAdmin} />}
      </div>
    </div>
  )
}
