import * as Sentry from '@sentry/react'
import React from 'react'
import ReactDOM from 'react-dom/client'
import "@github/spark/spark"

import App from './App.tsx'
import { initNativeFeatures } from './lib/capacitor'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE, // 'development' | 'production'
  enabled: import.meta.env.PROD,     // only active in production builds
  tracesSampleRate: 0.2,             // capture 20% of transactions for perf monitoring
  integrations: [
    Sentry.browserTracingIntegration(),
  ],
})

initNativeFeatures()

const container = document.getElementById('root')!
const root = ReactDOM.createRoot(container)
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
