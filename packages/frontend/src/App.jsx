import React, { useState, useEffect, useRef } from 'react'

// Simple helper to generate UUIDs for Idempotency Keys
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Gateway base URL
const API_BASE = 'http://localhost:3000/api'

// Colorful gradient avatars that cycle on click
const avatars = [
  'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)', // Indigo / Purple
  'linear-gradient(135deg, #ec4899 0%, #f43f5e 100%)', // Pink / Rose
  'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)', // Emerald / Blue
  'linear-gradient(135deg, #f59e0b 0%, #e11d48 100%)', // Amber / Ruby
  'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)', // Cyan / Royal
  'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', // Teal / Mint
]

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(null)
  
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard') // dashboard, telemetry
  const [avatarIndex, setAvatarIndex] = useState(parseInt(localStorage.getItem('avatarIndex') || '0', 10))

  // Auth Form state
  const [isRegister, setIsRegister] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  // Core Dashboard State
  const [wallet, setWallet] = useState(null)
  const [walletLoading, setWalletLoading] = useState(false)
  const [transactions, setTransactions] = useState([])
  const [txTotal, setTxTotal] = useState(0)
  const [txPage, setTxPage] = useState(1)
  const [analytics, setAnalytics] = useState(null)

  // Transfer Form State
  const [recipientEmail, setRecipientEmail] = useState('')
  const [amount, setAmount] = useState('')
  const [transferLoading, setTransferLoading] = useState(false)
  const [transferError, setTransferError] = useState('')
  const [transferSuccess, setTransferSuccess] = useState('')

  // Sandbox Simulation Header States
  const [simulateDelay, setSimulateDelay] = useState(0) // delay in ms
  const [simulateError, setSimulateError] = useState('') // custom failure message

  // Developer Webhook States
  const [webhookUrlInput, setWebhookUrlInput] = useState('')
  const [webhookSub, setWebhookSub] = useState(null)
  const [webhookLogs, setWebhookLogs] = useState([])
  const [showWebhookSecret, setShowWebhookSecret] = useState(false)
  const [expandedLogId, setExpandedLogId] = useState(null)

  // Saga Polling State
  const [processingTx, setProcessingTx] = useState(null)
  const pollTimerRef = useRef(null)

  // Interactive Map State
  const [hoveredStep, setHoveredStep] = useState(null)

  // Load User Data
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token)
      fetchMe()
    } else {
      localStorage.removeItem('token')
      setUser(null)
      setWallet(null)
    }
  }, [token])

  // Load Wallet/Transactions
  useEffect(() => {
    if (user) {
      fetchWallet()
      fetchTransactions(1)
      fetchAnalytics()
    }
  }, [user])

  // Poll Webhook settings when telemetry page is loaded
  useEffect(() => {
    if (user && activeTab === 'telemetry') {
      fetchWebhookSubscription()
      fetchWebhookLogs()
    }
  }, [user, activeTab])

  useEffect(() => {
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current)
    }
  }, [])

  // ── API Fetchers ─────────────────────────────────────────────────────────────
  
  const fetchMe = async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!res.ok) throw new Error('Session expired')
      const data = await res.json()
      setUser(data)
    } catch (err) {
      handleLogout()
    }
  }

  const fetchWallet = async () => {
    setWalletLoading(true)
    try {
      const res = await fetch(`${API_BASE}/wallets/me`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.status === 404) {
        setWallet(null)
      } else if (res.ok) {
        const data = await res.json()
        setWallet(data)
      }
    } catch (err) {
      console.error('Failed to load wallet', err)
    } finally {
      setWalletLoading(false)
    }
  }

  const createWallet = async () => {
    setWalletLoading(true)
    try {
      const res = await fetch(`${API_BASE}/wallets`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setWallet(data)
      }
    } catch (err) {
      console.error('Failed to create wallet', err)
    } finally {
      setWalletLoading(false)
    }
  }

  const fundWalletDemo = async () => {
    setWalletLoading(true)
    try {
      const res = await fetch(`${API_BASE}/wallets/me/fund`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setWallet(data)
        fetchAnalytics()
      }
    } catch (err) {
      console.error('Failed to fund wallet', err)
    } finally {
      setWalletLoading(false)
    }
  }

  const fetchTransactions = async (page = 1) => {
    try {
      const res = await fetch(`${API_BASE}/transfers?page=${page}&limit=5`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setTransactions(data.transactions || [])
        setTxTotal(data.total || 0)
        setTxPage(page)
      }
    } catch (err) {
      console.error('Failed to load transactions', err)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_BASE}/analytics/summary`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setAnalytics(data)
      }
    } catch (err) {
      console.error('Failed to load analytics', err)
    }
  }

  const fetchWebhookSubscription = async () => {
    try {
      const res = await fetch(`${API_BASE}/transfers/webhooks`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setWebhookSub(data)
        setWebhookUrlInput(data.url)
      } else {
        setWebhookSub(null)
      }
    } catch (err) {
      console.error('Failed to fetch webhooks', err)
    }
  }

  const fetchWebhookLogs = async () => {
    try {
      const res = await fetch(`${API_BASE}/transfers/webhooks/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setWebhookLogs(data)
      }
    } catch (err) {
      console.error('Failed to fetch webhook logs', err)
    }
  }

  const saveWebhookSubscription = async (e) => {
    e.preventDefault()
    try {
      const res = await fetch(`${API_BASE}/transfers/webhooks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url: webhookUrlInput })
      })
      if (res.ok) {
        const data = await res.json()
        setWebhookSub(data)
        fetchWebhookLogs()
        alert('Webhook subscription configured successfully!')
      }
    } catch (err) {
      console.error('Failed to save webhook URL', err)
    }
  }

  const handleRetryWebhook = async (logId) => {
    try {
      const res = await fetch(`${API_BASE}/transfers/webhooks/logs/${logId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        alert('Webhook retry delivery job enqueued in BullMQ!')
        setTimeout(fetchWebhookLogs, 1200)
      }
    } catch (err) {
      console.error('Failed to retry webhook', err)
    }
  }

  // ── Auth Handlers ─────────────────────────────────────────────────────────────

  const handleAuthSubmit = async (e) => {
    e.preventDefault()
    setAuthError('')
    setAuthLoading(true)

    const endpoint = isRegister ? '/auth/register' : '/auth/login'
    const payload = isRegister ? { name, email, password } : { email, password }

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message || 'Authentication failed')
      }

      if (isRegister) {
        setIsRegister(false)
        setAuthError('Registration successful! Please sign in.')
      } else {
        setToken(data.accessToken)
      }
    } catch (err) {
      setAuthError(err.message)
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = () => {
    setToken('')
    localStorage.removeItem('token')
    setUser(null)
    setWallet(null)
    setTransactions([])
    setAnalytics(null)
    setActiveTab('dashboard')
  }

  const cycleAvatar = () => {
    const nextIdx = (avatarIndex + 1) % avatars.length
    setAvatarIndex(nextIdx)
    localStorage.setItem('avatarIndex', nextIdx.toString())
  }

  // ── Transfer Handler & Saga Polling ───────────────────────────────────────────

  const handleTransferSubmit = async (e) => {
    e.preventDefault()
    setTransferError('')
    setTransferSuccess('')
    setTransferLoading(true)

    const amountInPaisa = Math.round(parseFloat(amount) * 100)
    if (isNaN(amountInPaisa) || amountInPaisa <= 0) {
      setTransferError('Please enter a valid amount in Rupees')
      setTransferLoading(false)
      return
    }

    const idemKey = uuidv4()

    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'Idempotency-Key': idemKey
      }

      // Inject Simulation Headers
      if (simulateDelay > 0) {
        headers['X-Simulate-Delay'] = simulateDelay.toString()
      }
      if (simulateError) {
        headers['X-Simulate-Error'] = simulateError
      }

      const res = await fetch(`${API_BASE}/transfers`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          receiverEmail: recipientEmail,
          amount: amountInPaisa,
          currency: 'INR'
        })
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error?.message || 'Failed to submit transfer')
      }

      setProcessingTx({
        id: data.transactionId,
        status: data.status || 'PENDING',
        amount: data.amount,
        receiver: recipientEmail,
      })

      startSagaPolling(data.transactionId)

    } catch (err) {
      setTransferError(err.message)
      setTransferLoading(false)
    }
  }

  const startSagaPolling = (transactionId) => {
    if (pollTimerRef.current) clearInterval(pollTimerRef.current)

    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/transfers/${transactionId}`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('Polling failed')
        const data = await res.json()

        setProcessingTx(prev => ({
          ...prev,
          status: data.status
        }))

        if (['COMPLETED', 'FAILED', 'ROLLED_BACK'].includes(data.status)) {
          clearInterval(pollTimerRef.current)
          setTransferLoading(false)
          setProcessingTx(null)

          if (data.status === 'COMPLETED') {
            setTransferSuccess(`Successfully sent ₹${(data.amount / 100).toFixed(2)} to ${recipientEmail}!`)
            setRecipientEmail('')
            setAmount('')
          } else {
            setTransferError(`Transfer failed: ${data.failureReason || 'Declined by banking core'}`)
          }

          fetchWallet()
          fetchTransactions(1)
          fetchAnalytics()
        }
      } catch (err) {
        console.error('Polling error', err)
      }
    }, 800)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!token || !user) {
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <div style={styles.brandTitle}>
            <span style={styles.brandSymbol}>⚡</span> FinPay
          </div>
          <p style={styles.authSub}>Distributed Payments Core System</p>

          <form onSubmit={handleAuthSubmit} style={styles.authForm}>
            {isRegister && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Full Name</label>
                <input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required
                />
              </div>
            )}
            <div style={styles.formGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                placeholder="you@domain.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Password</label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {authError && <div style={styles.errorAlert}>{authError}</div>}

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={authLoading}>
              {authLoading ? 'Verifying credentials...' : isRegister ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div style={styles.authToggle}>
            {isRegister ? 'Already have an account?' : "Don't have an account yet?"}{' '}
            <span style={styles.toggleLink} onClick={() => { setIsRegister(!isRegister); setAuthError(''); }}>
              {isRegister ? 'Sign In' : 'Sign Up'}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.dashboardLayout}>
      {/* Live System Telemetry Ticker */}
      <div style={styles.telemetryTicker}>
        <span style={styles.tickerBadge}>LIVE TELEMETRY</span>
        <span style={styles.tickerText}>
          ⚡ <b>11 / 11</b> Services Active & Healthy • Average Saga Settlement Time: <b>430ms</b> • Distributed Locks: <b>Lock Acquired (OK)</b> • Rate Limits: <b>Operational</b>
        </span>
      </div>

      {/* Premium Light Glassmorphism Navbar */}
      <header style={styles.navBar} className="nav-glass">
        <div style={styles.navContent}>
          <div style={styles.navLeft}>
            <div style={styles.navBrand}>
              <span style={styles.brandSymbol}>⚡</span> FinPay
            </div>
            <div style={styles.navTabs}>
              <button 
                style={activeTab === 'dashboard' ? styles.activeTabBtn : styles.tabBtn} 
                onClick={() => setActiveTab('dashboard')}
              >
                💳 Transfer Portal
              </button>
              <button 
                style={activeTab === 'telemetry' ? styles.activeTabBtn : styles.tabBtn} 
                onClick={() => setActiveTab('telemetry')}
              >
                🩺 System Map & Health
              </button>
            </div>
          </div>
          
          <div style={styles.userProfile}>
            <div 
              style={{ ...styles.avatar, background: avatars[avatarIndex] }}
              onClick={cycleAvatar}
              title="Click to cycle avatar colors!"
            >
              {user.name.slice(0, 2).toUpperCase()}
            </div>
            <div style={styles.userInfo}>
              <div style={styles.userName}>{user.name}</div>
              <div style={styles.userEmail}>{user.email}</div>
            </div>
            <button className="btn btn-danger" style={{ padding: '8px 16px', fontSize: '12px' }} onClick={handleLogout}>
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Router */}
      {activeTab === 'dashboard' ? (
        <main style={styles.mainGrid}>
          {/* Left Column: Balance & Transfer */}
          <section style={styles.leftCol}>
            <div style={{ ...styles.card, ...styles.crazyGradientCard }}>
              <div style={styles.crazyGradientOverlay}></div>
              <div style={{ position: 'relative', zIndex: 2 }}>
                <h3 style={{ ...styles.cardTitle, color: 'rgba(255,255,255,0.7)' }}>Digital Balance</h3>
                {walletLoading ? (
                  <div style={{ ...styles.loaderPlaceholder, color: '#fff' }}>Loading secure ledger details...</div>
                ) : wallet ? (
                  <div style={styles.walletContent}>
                    <div style={{ ...styles.balanceBig, color: '#ffffff', textShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                      ₹{(wallet.balance / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div style={{ ...styles.walletDetails, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '16px' }}>
                      <div style={styles.detailRow}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>Wallet ID:</span>
                        <code style={{ ...styles.code, backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff' }}>{wallet.walletId}</code>
                      </div>
                      <div style={styles.detailRow}>
                        <span style={{ color: 'rgba(255,255,255,0.8)' }}>Status:</span>
                        <span className="badge badge-success" style={{ backgroundColor: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none' }}>
                          {wallet.status}
                        </span>
                      </div>
                      <button
                        className="btn"
                        style={styles.whiteFundBtn}
                        onClick={fundWalletDemo}
                      >
                        💰 Add Mock ₹1,000.00
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={styles.noWalletBox}>
                    <p style={{ ...styles.noWalletText, color: '#fff' }}>No digital wallet exists for this account.</p>
                    <button className="btn btn-secondary" style={{ width: '100%' }} onClick={createWallet}>
                      Create Active Wallet
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Instant Transfer</h3>
              {wallet ? (
                <form onSubmit={handleTransferSubmit} style={styles.transferForm}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Recipient Email</label>
                    <input
                      type="email"
                      placeholder="recipient@domain.com"
                      value={recipientEmail}
                      onChange={e => setRecipientEmail(e.target.value)}
                      required
                      disabled={transferLoading}
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Amount (₹)</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={amount}
                      onChange={e => setAmount(e.target.value)}
                      required
                      disabled={transferLoading}
                    />
                  </div>

                  {transferError && <div style={styles.errorAlert}>{transferError}</div>}
                  {transferSuccess && <div style={styles.successAlert}>{transferSuccess}</div>}

                  {processingTx && (
                    <div style={styles.sagaProgressBox}>
                      <div style={styles.sagaRow}>
                        <span style={styles.spinner}></span>
                        <span>
                          Saga Pipeline Execution: <code style={styles.code}>{processingTx.id}</code>
                        </span>
                      </div>
                      <div style={styles.sagaStatusRow}>
                        <span>Status:</span>
                        <span className={`badge ${processingTx.status === 'PENDING' || processingTx.status === 'PROCESSING' ? 'badge-pending' : 'badge-failed'}`}>
                          {processingTx.status}
                        </span>
                      </div>
                      <p style={styles.sagaTip}>Background payment-worker is processing locks and ledger updates...</p>
                    </div>
                  )}

                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={transferLoading || wallet.status !== 'active'}>
                    {transferLoading ? 'Processing Secure Transfer...' : 'Initiate Instant Transfer'}
                  </button>
                </form>
              ) : (
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Create an active wallet first to send transfers.</p>
              )}
            </div>

            {/* Sandbox Simulation Header Panel */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>🛠️ Developer Simulation Settings</h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                Simulate latency or throw custom exceptions. Active values will be injected as client request headers on your next transfer.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>X-Simulate-Delay (Artificial Latency)</label>
                  <select 
                    value={simulateDelay} 
                    onChange={e => setSimulateDelay(parseInt(e.target.value, 10))}
                  >
                    <option value={0}>0ms (Instant Settlement)</option>
                    <option value={2000}>2000ms (2s delay)</option>
                    <option value={4000}>4000ms (4s delay)</option>
                    <option value={6000}>6000ms (6s delay)</option>
                  </select>
                </div>

                <div style={styles.formGroup}>
                  <label style={styles.label}>X-Simulate-Error (Throw Custom Exception)</label>
                  <select 
                    value={simulateError} 
                    onChange={e => setSimulateError(e.target.value)}
                  >
                    <option value="">None (Standard Transaction Flow)</option>
                    <option value="CARD_DECLINED">CARD_DECLINED (Declined by Issuer)</option>
                    <option value="EXPIRED_CARD">EXPIRED_CARD (Card expired)</option>
                    <option value="INSUFFICIENT_FUNDS">INSUFFICIENT_FUNDS (Trigger Balance compensation)</option>
                    <option value="LIMIT_EXCEEDED">LIMIT_EXCEEDED (Limit block)</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Ledger History & Analytics */}
          <section style={styles.rightCol}>
            {analytics && (
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Activity Analytics ({analytics.period})</h3>
                <div style={styles.analyticsGrid}>
                  <div style={styles.statBox}>
                    <span style={styles.statLabel}>Total Outbound</span>
                    <span style={styles.statValue}>₹{(analytics.totalSent / 100).toFixed(2)}</span>
                  </div>
                  <div style={styles.statBox}>
                    <span style={styles.statLabel}>Total Inbound</span>
                    <span style={styles.statValue}>₹{(analytics.totalReceived / 100).toFixed(2)}</span>
                  </div>
                  <div style={styles.statBox}>
                    <span style={styles.statLabel}>Total Transfers</span>
                    <span style={styles.statValue}>{analytics.transactionCount}</span>
                  </div>
                  <div style={styles.statBox}>
                    <span style={styles.statLabel}>Failed Transactions</span>
                    <span style={{ ...styles.statValue, color: 'var(--accent-rose)' }}>{analytics.failedCount}</span>
                  </div>
                </div>

                <div style={styles.graphicChart}>
                  <div style={{ ...styles.chartBar, height: `${Math.min(100, Math.max(10, (analytics.totalSent / (analytics.totalSent + analytics.totalReceived + 1)) * 100))}%`, backgroundColor: 'var(--accent-primary)' }} title="Sent"></div>
                  <div style={{ ...styles.chartBar, height: `${Math.min(100, Math.max(10, (analytics.totalReceived / (analytics.totalSent + analytics.totalReceived + 1)) * 100))}%`, backgroundColor: 'var(--accent-mint)' }} title="Received"></div>
                  <div style={{ ...styles.chartBar, height: `${Math.min(100, Math.max(10, (analytics.failedCount / (analytics.transactionCount + 1)) * 100))}%`, backgroundColor: 'var(--accent-rose)' }} title="Failed"></div>
                </div>
              </div>
            )}

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Recent Ledger History</h3>
              {transactions.length > 0 ? (
                <div style={styles.ledgerWrapper}>
                  <table style={styles.ledgerTable}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Direction</th>
                        <th style={styles.th}>Amount</th>
                        <th style={styles.th}>Status</th>
                        <th style={styles.th}>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => {
                        const isSender = t.senderWalletId === wallet?.walletId
                        return (
                          <tr key={t._id} style={styles.tr}>
                            <td style={styles.td}>
                              {isSender ? (
                                <span style={{ color: 'var(--accent-rose)', fontWeight: '600' }}>▲ Outbound</span>
                              ) : (
                                <span style={{ color: 'var(--accent-mint)', fontWeight: '600' }}>▼ Inbound</span>
                              )}
                            </td>
                            <td style={styles.td}>
                              <b>₹{(t.amount / 100).toFixed(2)}</b>
                            </td>
                            <td style={styles.td}>
                              <span className={`badge ${t.status === 'COMPLETED' ? 'badge-success' : t.status === 'PENDING' || t.status === 'PROCESSING' ? 'badge-pending' : 'badge-failed'}`}>
                                {t.status}
                              </span>
                            </td>
                            <td style={styles.td}>
                              {new Date(t.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  {txTotal > 5 && (
                    <div style={styles.pagination}>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                        disabled={txPage === 1}
                        onClick={() => fetchTransactions(txPage - 1)}
                      >
                        Prev
                      </button>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Page {txPage}</span>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '6px 12px', fontSize: '11px' }}
                        disabled={txPage * 5 >= txTotal}
                        onClick={() => fetchTransactions(txPage + 1)}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <p style={styles.emptyTableText}>No transaction ledger lines found.</p>
              )}
            </div>

            <div style={styles.adminFooter}>
              ⚙️ Backend Telemetry: <a href="http://localhost:3010/ui" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Inspect job queues on Bull Board UI</a>
            </div>
          </section>
        </main>
      ) : (
        /* Tab: Microservices Health, Map & Webhooks Dev Console */
        <main style={styles.tabContent}>
          <div style={styles.welcomeBanner}>
            <h2 style={{ fontSize: '24px', color: 'var(--text-primary)', marginBottom: '8px' }}>
              🩺 Distributed Microservices Map & Developer Console
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
              FinPay comprises 11 decoupled services. Review active container logs, inspect system routing, or register your custom webhook receiver settings.
            </p>
          </div>

          <div style={styles.mapLayout}>
            {/* Left Box: Flow Diagram & Telemetry */}
            <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Transaction Pipeline Map</h3>
                <div style={styles.architectureVisual}>
                  {architectureSteps.map((step, idx) => (
                    <div 
                      key={step.id} 
                      style={{
                        ...styles.visualNode,
                        ...(hoveredStep === step.id ? styles.visualNodeHovered : {})
                      }}
                      onMouseEnter={() => setHoveredStep(step.id)}
                      onMouseLeave={() => setHoveredStep(null)}
                    >
                      <div style={styles.nodeNumber}>{idx + 1}</div>
                      <h4 style={{ fontSize: '13px', fontWeight: '700' }}>{step.title}</h4>
                      <p style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>{step.sub}</p>
                    </div>
                  ))}
                </div>

                <div style={styles.mapDetailsBox}>
                  {hoveredStep ? (
                    <div>
                      <h3 style={{ color: 'var(--accent-primary)', marginBottom: '8px', fontSize: '15px' }}>
                        Step {hoveredStep}: {architectureSteps.find(s => s.id === hoveredStep).title}
                      </h3>
                      <p style={{ lineHeight: '1.5', fontSize: '13px', color: 'var(--text-secondary)' }}>
                        {architectureSteps.find(s => s.id === hoveredStep).details}
                      </p>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '13px' }}>
                      💡 Hover over any numbered node above to view core technical logs and details.
                    </div>
                  )}
                </div>
              </div>

              {/* Webhook Configuration Card */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>⚙️ Developer Webhook Subscriptions</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Register a local HTTP endpoint. FinPay will post a cryptographically signed HMAC-SHA256 signature payload whenever transaction states settle.
                </p>
                <form onSubmit={saveWebhookSubscription} style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                  <input 
                    type="url" 
                    placeholder="http://localhost:8080/webhooks"
                    value={webhookUrlInput}
                    onChange={e => setWebhookUrlInput(e.target.value)}
                    required
                    style={{ flex: 1 }}
                  />
                  <button type="submit" className="btn btn-primary" style={{ padding: '0 24px' }}>
                    Save URL
                  </button>
                </form>

                {webhookSub ? (
                  <div style={styles.webhookDetailsBox}>
                    <div style={styles.detailRow} style={{ marginBottom: '8px', fontSize: '13px' }}>
                      <span><strong>Active Target:</strong></span>
                      <code style={styles.code}>{webhookSub.url}</code>
                    </div>
                    <div style={styles.detailRow} style={{ fontSize: '13px' }}>
                      <span><strong>Signature Secret:</strong></span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <code style={styles.code}>
                          {showWebhookSecret ? webhookSub.secret : '••••••••••••••••••••••••••••'}
                        </code>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '4px 8px', fontSize: '10px' }}
                          onClick={() => setShowWebhookSecret(!showWebhookSecret)}
                        >
                          {showWebhookSecret ? 'Hide' : 'Reveal'}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)' }}>No webhook subscriber configured yet.</p>
                )}
              </div>

              {/* Webhook Logs Panel */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Webhook Dispatch Logs</h3>
                {webhookLogs.length > 0 ? (
                  <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {webhookLogs.map((log) => (
                      <div key={log._id} style={styles.webhookLogItem}>
                        <div style={styles.logHeader}>
                          <span style={{ fontSize: '12px', fontWeight: '700' }}>{log.eventType}</span>
                          <span className={`badge ${log.status === 'success' ? 'badge-success' : 'badge-failed'}`}>
                            {log.status === 'success' ? `${log.statusCode} OK` : `${log.statusCode || 'ERR'}`}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            URL: <code style={styles.code}>{log.url}</code> • Attempts: <b>{log.attempts}</b>
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '10px' }}
                              onClick={() => setExpandedLogId(expandedLogId === log._id ? null : log._id)}
                            >
                              {expandedLogId === log._id ? 'Close details' : 'Inspect JSON'}
                            </button>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '4px 8px', fontSize: '10px', borderColor: 'var(--accent-primary)' }}
                              onClick={() => handleRetryWebhook(log._id)}
                            >
                              🔁 Re-send
                            </button>
                          </div>
                        </div>

                        {expandedLogId === log._id && (
                          <div style={styles.logPayloadBox}>
                            <strong>Payload Dispatched:</strong>
                            <pre style={styles.payloadPre}>{JSON.stringify(log.payload, null, 2)}</pre>
                            <strong style={{ marginTop: '8px', display: 'block' }}>Receiver Response Body:</strong>
                            <pre style={styles.payloadPre}>{log.responseBody || '(No response returned)'}</pre>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center' }}>
                    No webhook dispatches logged yet. Complete transfers to trigger deliveries.
                  </p>
                )}
              </div>
            </div>

            {/* Right Box: Health Grid */}
            <div style={{ flex: '1 1 500px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Service Status Console</h3>
                <div style={styles.telemetryList}>
                  {microservicesList.map((svc) => (
                    <div style={styles.telemetryItem} key={svc.name}>
                      <div style={styles.telemetryHeader}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '18px' }}>{svc.icon}</span>
                          <span style={{ fontWeight: '700', fontSize: '14px' }}>{svc.name}</span>
                          <code style={{ fontSize: '11px', color: 'var(--text-muted)' }}>:{svc.port}</code>
                        </div>
                        <span style={styles.healthTag}>
                          <span style={styles.healthDot}></span> ACTIVE
                        </span>
                      </div>
                      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>{svc.description}</p>
                      <div style={styles.statusCardLogs}>
                        <code style={styles.miniLogLine}>{svc.mockLog}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      )}
    </div>
  )
}

// ── Mock Microservices list ───────────────────────────────────────────
const microservicesList = [
  {
    name: 'api-gateway',
    icon: '⚡',
    port: '3000',
    description: 'Entry gateway. Manages global sliding rate limits (100 req/m) and authentication.',
    mockLog: 'api-gateway | proxying request /api/transfers to transaction-service',
  },
  {
    name: 'auth-service',
    icon: '🔐',
    port: '3001',
    description: 'Manages user identities, secure passwords, and signs JWT verification claims.',
    mockLog: 'auth-service | verified user session token successfully',
  },
  {
    name: 'wallet-service',
    icon: '💳',
    port: '3002',
    description: 'Updates ledger and balances. Enforces Redis locks to prevent race double-spends.',
    mockLog: 'wallet-service | acquired lock balance check for wallet: 6a4ead15',
  },
  {
    name: 'transaction-service',
    icon: '⚙️',
    port: '3003',
    description: 'Enqueues transfers to BullMQ and returns HTTP 202 Accepted status.',
    mockLog: 'transaction-service | enqueued process-transfer job to Redis successfully',
  },
  {
    name: 'payment-worker',
    icon: '👷',
    port: 'Worker',
    description: 'Runs transfer Sagas, balance credits/debits, and rollback compensation logs.',
    mockLog: 'payment-worker | Saga settled successfully for transaction ID: 6a4eb23f',
  },
  {
    name: 'notification-service',
    icon: '✉️',
    port: 'PubSub',
    description: 'Subscribes to Redis Pub/Sub channels to queue, mail, and webhook alerts.',
    mockLog: 'notification-service | Webhook delivery task enqueued for transaction ID: 6a4eb23f',
  },
  {
    name: 'analytics-service',
    icon: '📈',
    port: '3005',
    description: 'Consumes stream events via XREADGROUP. Aggregates monthly client transaction totals.',
    mockLog: 'analytics-service | computed monthly activity totals for period 2026-07',
  },
  {
    name: 'bull-board',
    icon: '📊',
    port: '3010',
    description: 'Provides a dashboard to monitor active, failed, and completed queue jobs.',
    mockLog: 'bull-board | Telemetry dashboard listening at http://localhost:3010/ui',
  },
]

// Steps for Interactive Arch Map
const architectureSteps = [
  {
    id: 1,
    title: 'Client Request',
    sub: 'POST /api/transfers',
    details: 'The React browser sends a transaction amount, recipient details, and a unique browser-generated Idempotency-Key header to the API Gateway.',
  },
  {
    id: 2,
    title: 'API Gateway',
    sub: 'Auth & Rate Check',
    details: 'Gateway verifies rate quotas using Redis INCR sliding windows, validates the user JWT token, and routes the request to transaction service.',
  },
  {
    id: 3,
    title: 'Queue Enqueue',
    sub: 'Save & Dispatch',
    details: 'The Transaction service creates a PENDING state document in MongoDB, cache-checks the Idempotency Key in Redis, enqueues to BullMQ, and returns a 202 Accepted response.',
  },
  {
    id: 4,
    title: 'payment-worker',
    sub: 'Saga Pipeline',
    details: 'The worker picks up the job. It locks the sender wallet, checks/debits the amount, then credits the receiver. If credit fails, Saga Compensating actions automatically rollback.',
  },
  {
    id: 5,
    title: 'Wallet Service',
    sub: 'Distributed Locks',
    details: 'Wallet updates balances atomically. Uses distributed Redis locks (SET NX PX) and Lua scripts to prevent race conditions during concurrent debits.',
  },
  {
    id: 6,
    title: 'Event Streaming',
    sub: 'Redis Stream/PubSub',
    details: 'The worker outputs transaction results. COMPLETED/FAILED events are published to a Redis Stream (for aggregation) and a Pub/Sub channel (for mail alerts).',
  },
  {
    id: 7,
    title: 'Notifications',
    sub: 'Asynchronous Mail',
    details: 'The Notification service reads the payment Pub/Sub events, schedules delivery tasks, and emails the users via Resend Mail SDK.',
  },
  {
    id: 8,
    title: 'Analytics Aggregate',
    sub: 'XREADGROUP Stream',
    details: 'The Analytics service consumes the Redis Stream offsets. Re-calculates and caches monthly activity metrics (total sent/received) in MongoDB.',
  },
]

// ── Styles (Premium Pastel Glassmorphism Dashboard) ──────────────────────────
const styles = {
  authContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    backgroundColor: '#f1f5f9',
    background: 'radial-gradient(at 0% 0%, rgba(99, 102, 241, 0.05) 0px, transparent 50%), radial-gradient(at 100% 100%, rgba(236, 72, 153, 0.05) 0px, transparent 50%), #f1f5f9',
  },
  authCard: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: '#ffffff',
    border: '1px solid rgba(15, 23, 42, 0.06)',
    borderRadius: '24px',
    padding: '40px',
    boxShadow: '0 20px 40px -15px rgba(15, 23, 42, 0.1)',
  },
  brandTitle: {
    fontSize: '28px',
    fontWeight: '800',
    color: 'var(--text-primary)',
    textAlign: 'center',
    marginBottom: '4px',
    fontFamily: 'var(--font-display)',
  },
  brandSymbol: {
    color: 'var(--accent-primary)',
    textShadow: '0 0 10px rgba(99, 102, 241, 0.2)',
  },
  authSub: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    marginBottom: '32px',
  },
  authForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '11px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  errorAlert: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    border: '1px solid rgba(239, 68, 68, 0.15)',
    color: 'var(--accent-rose)',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '13px',
  },
  successAlert: {
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    border: '1px solid rgba(16, 185, 129, 0.15)',
    color: 'var(--accent-mint)',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '13px',
  },
  authToggle: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    textAlign: 'center',
    marginTop: '24px',
  },
  toggleLink: {
    color: 'var(--accent-primary)',
    fontWeight: '600',
    cursor: 'pointer',
  },
  dashboardLayout: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  },
  telemetryTicker: {
    backgroundColor: '#0f172a',
    color: '#94a3b8',
    fontSize: '11px',
    fontFamily: 'monospace',
    padding: '8px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
  },
  tickerBadge: {
    backgroundColor: 'var(--accent-primary)',
    color: '#fff',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '800',
  },
  tickerText: {
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  navBar: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    width: '100%',
    padding: '12px 40px',
  },
  navContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
  },
  navLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '32px',
  },
  navBrand: {
    fontSize: '22px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
    color: 'var(--text-primary)',
  },
  navTabs: {
    display: 'flex',
    gap: '6px',
  },
  tabBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-display)',
    fontWeight: '600',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '8px 16px',
    borderRadius: '8px',
    transition: 'var(--transition-smooth)',
  },
  activeTabBtn: {
    background: 'rgba(99, 102, 241, 0.08)',
    border: 'none',
    color: 'var(--accent-primary)',
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '8px 16px',
    borderRadius: '8px',
  },
  userProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '12px',
    fontWeight: '800',
    cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(0,0,0,0.05)',
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    textAlign: 'left',
  },
  userName: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  userEmail: {
    fontSize: '11px',
    color: 'var(--text-secondary)',
  },
  mainGrid: {
    flex: 1,
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '32px 40px',
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: '24px',
  },
  leftCol: {
    gridColumn: 'span 5',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  rightCol: {
    gridColumn: 'span 7',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  tabContent: {
    flex: 1,
    maxWidth: '1200px',
    width: '100%',
    margin: '0 auto',
    padding: '32px 40px',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  welcomeBanner: {
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.05) 0%, rgba(236, 72, 153, 0.01) 100%)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '20px',
    padding: '24px 32px',
  },
  mapLayout: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '24px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid var(--border-subtle)',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: 'var(--shadow-premium)',
    position: 'relative',
    overflow: 'hidden',
    transition: 'transform 0.2s ease',
  },
  crazyGradientCard: {
    background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
    border: 'none',
  },
  crazyGradientOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    background: 'radial-gradient(at 0% 0%, rgba(255,255,255,0.15) 0px, transparent 70%)',
    pointerEvents: 'none',
  },
  whiteFundBtn: {
    width: '100%',
    marginTop: '16px',
    fontSize: '12px',
    backgroundColor: '#ffffff',
    color: '#0f172a',
    border: 'none',
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  },
  cardTitle: {
    fontSize: '12px',
    fontWeight: '700',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '20px',
  },
  balanceBig: {
    fontSize: '44px',
    fontWeight: '800',
    letterSpacing: '-0.02em',
    marginBottom: '16px',
  },
  walletDetails: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
    padding: '3px 6px',
    borderRadius: '6px',
    fontSize: '11px',
    color: 'var(--text-primary)',
  },
  noWalletBox: {
    textAlign: 'center',
    padding: '16px 0',
  },
  noWalletText: {
    fontSize: '14px',
    marginBottom: '16px',
  },
  transferForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  sagaProgressBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    border: '1px solid rgba(99, 102, 241, 0.12)',
    borderRadius: '12px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sagaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    fontSize: '12px',
  },
  sagaStatusRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '12px',
  },
  sagaTip: {
    fontSize: '10px',
    color: 'var(--text-secondary)',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(99, 102, 241, 0.1)',
    borderTopColor: 'var(--accent-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  statBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.01)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  statLabel: {
    fontSize: '10px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-primary)',
  },
  graphicChart: {
    marginTop: '20px',
    height: '50px',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '10px',
    padding: '6px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  chartBar: {
    flex: 1,
    borderRadius: '3px 3px 0 0',
    transition: 'height 0.5s ease',
  },
  ledgerWrapper: {
    overflowX: 'auto',
  },
  ledgerTable: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '13px',
  },
  th: {
    textAlign: 'left',
    padding: '10px 12px',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    fontWeight: '600',
  },
  tr: {
    borderBottom: '1px solid rgba(15, 23, 42, 0.03)',
  },
  td: {
    padding: '12px 12px',
    color: 'var(--text-primary)',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '16px',
  },
  emptyTableText: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '20px',
  },
  adminFooter: {
    textAlign: 'center',
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginTop: '10px',
  },
  footerLink: {
    color: 'var(--accent-primary)',
    textDecoration: 'none',
    fontWeight: '700',
  },
  architectureVisual: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
    marginBottom: '20px',
  },
  visualNode: {
    flex: '1 1 180px',
    backgroundColor: 'rgba(15, 23, 42, 0.01)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '14px',
    cursor: 'pointer',
    transition: 'var(--transition-smooth)',
  },
  visualNodeHovered: {
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
    borderColor: 'var(--accent-primary)',
    transform: 'translateY(-2px)',
    boxShadow: '0 8px 20px -8px rgba(99, 102, 241, 0.2)',
  },
  nodeNumber: {
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-primary)',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: '700',
    marginBottom: '8px',
  },
  mapDetailsBox: {
    backgroundColor: '#f8fafc',
    border: '1px solid rgba(15, 23, 42, 0.06)',
    borderRadius: '16px',
    padding: '20px',
    minHeight: '100px',
  },
  sagaSimulationVisual: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    backgroundColor: '#f8fafc',
    borderRadius: '12px',
    border: '1px solid rgba(15, 23, 42, 0.05)',
  },
  simStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  },
  simCircle: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '2px solid var(--border-subtle)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: '700',
    fontSize: '12px',
  },
  simLine: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  telemetryList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  telemetryItem: {
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '12px',
  },
  telemetryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  healthTag: {
    fontSize: '9px',
    fontWeight: '800',
    color: 'var(--accent-mint)',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  },
  healthDot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    backgroundColor: 'var(--accent-mint)',
    boxShadow: '0 0 6px var(--accent-mint)',
  },
  statusCardLogs: {
    backgroundColor: '#0f172a',
    padding: '8px 12px',
    borderRadius: '8px',
    marginTop: '8px',
    fontFamily: 'monospace',
  },
  miniLogLine: {
    fontSize: '11px',
    color: '#38bdf8',
  },
  webhookDetailsBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.02)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  webhookLogItem: {
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '14px',
    backgroundColor: '#ffffff',
  },
  logHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logPayloadBox: {
    marginTop: '12px',
    borderTop: '1px dashed var(--border-subtle)',
    paddingTop: '12px',
    fontSize: '11px',
  },
  payloadPre: {
    backgroundColor: '#0f172a',
    color: '#38bdf8',
    padding: '10px',
    borderRadius: '6px',
    overflowX: 'auto',
    margin: '4px 0',
    fontSize: '10px',
    fontFamily: 'monospace',
  },
}
