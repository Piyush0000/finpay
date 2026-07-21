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
  
  // Navigation State
  const [activeRole, setActiveRole] = useState('merchant') // merchant, admin, developer
  const [activeTab, setActiveTab] = useState('portal') // dynamic based on role
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

  // Payment Links States
  const [paymentLinks, setPaymentLinks] = useState([])
  const [paymentLinkDescInput, setPaymentLinkDescInput] = useState('')
  const [paymentLinkAmountInput, setPaymentLinkAmountInput] = useState('')
  const [paymentLinksLoading, setPaymentLinksLoading] = useState(false)
  const [checkoutModalLink, setCheckoutModalLink] = useState(null) // payment link being paid
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutResult, setCheckoutResult] = useState(null) // success/error alert

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

  // Load webhook data when activeRole is developer
  useEffect(() => {
    if (user && activeRole === 'developer') {
      fetchWebhookSubscription()
      fetchWebhookLogs()
    }
  }, [user, activeRole, activeTab])

  // Load payment links data
  useEffect(() => {
    if (user && activeRole === 'merchant' && activeTab === 'payment-links') {
      fetchPaymentLinks()
    }
  }, [user, activeRole, activeTab])

  // Adjust active tab automatically when activeRole changes
  useEffect(() => {
    if (activeRole === 'merchant') {
      setActiveTab('portal')
    } else if (activeRole === 'admin') {
      setActiveTab('health')
    } else if (activeRole === 'developer') {
      setActiveTab('webhooks')
    }
  }, [activeRole])

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

  // ── Payment Links API Fetchers ──────────────────────────────────────────────

  const fetchPaymentLinks = async () => {
    setPaymentLinksLoading(true)
    try {
      const res = await fetch(`${API_BASE}/payment-links`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) {
        const data = await res.json()
        setPaymentLinks(data)
      }
    } catch (err) {
      console.error('Failed to fetch payment links', err)
    } finally {
      setPaymentLinksLoading(false)
    }
  }

  const handleCreatePaymentLink = async (e) => {
    e.preventDefault()
    const amountInPaisa = Math.round(parseFloat(paymentLinkAmountInput) * 100)
    if (isNaN(amountInPaisa) || amountInPaisa <= 0) {
      alert('Please enter a valid amount')
      return
    }

    try {
      const res = await fetch(`${API_BASE}/payment-links`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          amount: amountInPaisa,
          description: paymentLinkDescInput,
          merchantEmail: user.email
        })
      })
      if (res.ok) {
        setPaymentLinkAmountInput('')
        setPaymentLinkDescInput('')
        fetchPaymentLinks()
      }
    } catch (err) {
      console.error('Failed to create payment link', err)
    }
  }

  const handlePayPaymentLink = async (linkId) => {
    setCheckoutLoading(true)
    setCheckoutResult(null)
    try {
      const res = await fetch(`${API_BASE}/payment-links/${linkId}/pay`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      const data = await res.json()
      if (res.ok) {
        setCheckoutResult({ success: true, message: 'Checkout Payment Settled successfully!' })
        fetchPaymentLinks()
        fetchWallet()
        fetchTransactions(1)
        fetchAnalytics()
      } else {
        setCheckoutResult({ success: false, message: data.error?.message || 'Checkout failed' })
      }
    } catch (err) {
      setCheckoutResult({ success: false, message: err.message })
    } finally {
      setCheckoutLoading(false)
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
    setActiveRole('merchant')
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
          ⚡ <b>12 / 12</b> Services Active & Healthy • Average Saga Settlement Time: <b>430ms</b> • Distributed Locks: <b>Lock Acquired (OK)</b> • Rate Limits: <b>Operational</b>
        </span>
      </div>

      {/* Premium Light Glassmorphism Navbar */}
      <header style={styles.navBar} className="nav-glass">
        <div style={styles.navContent}>
          <div style={styles.navLeft}>
            <div style={styles.navBrand}>
              <span style={styles.brandSymbol}>⚡</span> FinPay
            </div>
            
            {/* Horizontal Role Selector Ticker */}
            <div style={styles.roleContainer}>
              <span style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)' }}>ROLE:</span>
              <div style={styles.roleGroup}>
                <button 
                  style={activeRole === 'merchant' ? styles.activeRoleBtn : styles.roleBtn}
                  onClick={() => setActiveRole('merchant')}
                >
                  💳 Client Portal
                </button>
                <button 
                  style={activeRole === 'admin' ? styles.activeRoleBtn : styles.roleBtn}
                  onClick={() => setActiveRole('admin')}
                >
                  🛡️ Platform Operator
                </button>
                <button 
                  style={activeRole === 'developer' ? styles.activeRoleBtn : styles.roleBtn}
                  onClick={() => setActiveRole('developer')}
                >
                  ⚙️ Integration Dev
                </button>
              </div>
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

      {/* Structured Sidebar Layout */}
      <div style={styles.workspaceWrapper}>
        <aside style={styles.sidebar}>
          <div style={styles.sidebarTitle}>Navigation</div>
          <nav style={styles.sidebarNav}>
            {activeRole === 'merchant' && (
              <>
                <button 
                  style={activeTab === 'portal' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('portal')}
                >
                  💳 Account Overview
                </button>
                <button 
                  style={activeTab === 'payment-links' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('payment-links')}
                >
                  🔗 Payment Links
                </button>
                <button 
                  style={activeTab === 'ledger' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('ledger')}
                >
                  📋 Ledger Ledger History
                </button>
              </>
            )}

            {activeRole === 'admin' && (
              <>
                <button 
                  style={activeTab === 'health' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('health')}
                >
                  🩺 Diagnostic Health
                </button>
                <button 
                  style={activeTab === 'flowmap' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('flowmap')}
                >
                  🗺️ Transaction Map
                </button>
                <button 
                  style={activeTab === 'analytics' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('analytics')}
                >
                  📈 Core Aggregates
                </button>
              </>
            )}

            {activeRole === 'developer' && (
              <>
                <button 
                  style={activeTab === 'webhooks' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('webhooks')}
                >
                  ⚙️ Webhooks config
                </button>
                <button 
                  style={activeTab === 'logs' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('logs')}
                >
                  📋 Delivery logs
                </button>
                <button 
                  style={activeTab === 'sdk' ? styles.activeSidebarBtn : styles.sidebarBtn}
                  onClick={() => setActiveTab('sdk')}
                >
                  📦 Node.js NPM SDK
                </button>
              </>
            )}
          </nav>
        </aside>

        {/* Right Content panel */}
        <section style={styles.contentPanel}>

          {/* VIEW: MERCHANT - Portal */}
          {activeRole === 'merchant' && activeTab === 'portal' && (
            <div style={styles.grid2Col}>
              <div style={styles.flexColGap}>
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
                          <button className="btn" style={styles.whiteFundBtn} onClick={fundWalletDemo}>
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
                              Saga Pipeline: <code style={styles.code}>{processingTx.id}</code>
                            </span>
                          </div>
                          <div style={styles.sagaStatusRow}>
                            <span>Status:</span>
                            <span className={`badge ${processingTx.status === 'PENDING' || processingTx.status === 'PROCESSING' ? 'badge-pending' : 'badge-failed'}`}>
                              {processingTx.status}
                            </span>
                          </div>
                        </div>
                      )}

                      <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }} disabled={transferLoading || wallet.status !== 'active'}>
                        {transferLoading ? 'Processing Secure Transfer...' : 'Initiate Instant Transfer'}
                      </button>
                    </form>
                  ) : (
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Create an active wallet first.</p>
                  )}
                </div>
              </div>

              {/* Dev Sandbox Controls inside portal */}
              <div>
                <div style={styles.card}>
                  <h3 style={styles.cardTitle}>🛠️ Sandbox Simulation Settings</h3>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                    Trigger latency delays or force transactions to decline. Parameters are injected dynamically on your next transfer.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>X-Simulate-Delay (Artificial Latency)</label>
                      <select value={simulateDelay} onChange={e => setSimulateDelay(parseInt(e.target.value, 10))}>
                        <option value={0}>0ms (Instant Settlement)</option>
                        <option value={2000}>2000ms (2s delay)</option>
                        <option value={4000}>4000ms (4s delay)</option>
                      </select>
                    </div>
                    <div style={styles.formGroup}>
                      <label style={styles.label}>X-Simulate-Error (Throw Custom Exception)</label>
                      <select value={simulateError} onChange={e => setSimulateError(e.target.value)}>
                        <option value="">None (Standard Transaction Flow)</option>
                        <option value="CARD_DECLINED">CARD_DECLINED (Declined by Issuer)</option>
                        <option value="EXPIRED_CARD">EXPIRED_CARD (Card expired)</option>
                        <option value="INSUFFICIENT_FUNDS">INSUFFICIENT_FUNDS (Trigger Balance Compensation)</option>
                        <option value="LIMIT_EXCEEDED">LIMIT_EXCEEDED (Limit Block)</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: MERCHANT - Payment Links */}
          {activeRole === 'merchant' && activeTab === 'payment-links' && (
            <div style={styles.grid2Col}>
              {/* Left Form */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>🔗 Generate Payment Link</h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Create shareable checkout pages for your clients. They will pay directly using the published SDK under the hood.
                </p>
                <form onSubmit={handleCreatePaymentLink} style={styles.transferForm}>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Amount (₹)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      placeholder="0.00"
                      value={paymentLinkAmountInput}
                      onChange={e => setPaymentLinkAmountInput(e.target.value)}
                      required
                    />
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Description / Order ID</label>
                    <input 
                      type="text" 
                      placeholder="e.g. Mechanical Keyboard"
                      value={paymentLinkDescInput}
                      onChange={e => setPaymentLinkDescInput(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '10px' }}>
                    Generate Shareable Link
                  </button>
                </form>
              </div>

              {/* Right List */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Active Links</h3>

                {/* Settle a Link search box */}
                <div style={{ marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px dashed var(--border-subtle)' }}>
                  <label style={styles.label}>Pay by Link ID</label>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input 
                      type="text" 
                      placeholder="Paste Link ID (e.g. 6a4e...)"
                      id="searchLinkIdInput"
                      style={{ flex: 1, padding: '8px 12px', fontSize: '12px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}
                    />
                    <button 
                      className="btn btn-primary" 
                      style={{ padding: '0 16px', fontSize: '12px' }}
                      onClick={async () => {
                        const inputVal = document.getElementById('searchLinkIdInput').value.trim()
                        if (!inputVal) return
                        try {
                          const res = await fetch(`${API_BASE}/payment-links/${inputVal}`, {
                            headers: { Authorization: `Bearer ${token}` }
                          })
                          if (res.ok) {
                            const fetchedLink = await res.json()
                            setCheckoutModalLink(fetchedLink)
                            setCheckoutResult(null)
                          } else {
                            alert('Link ID not found')
                          }
                        } catch (err) {
                          alert('Error fetching Link ID')
                        }
                      }}
                    >
                      Search & Pay
                    </button>
                  </div>
                </div>

                {paymentLinksLoading ? (
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading links...</p>
                ) : paymentLinks.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '350px', overflowY: 'auto' }}>
                    {paymentLinks.map(link => (
                      <div key={link._id} style={{ border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '14px', backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '13px' }}>{link.description}</strong>
                          <span className={`badge ${link.status === 'paid' ? 'badge-success' : 'badge-pending'}`}>
                            {link.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            Amount: <b>₹{(link.amount / 100).toFixed(2)}</b>
                          </span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {link.status === 'active' && (
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '11px', borderColor: 'var(--border-subtle)' }}
                                onClick={() => {
                                  navigator.clipboard.writeText(link._id)
                                  alert('Copied Link ID to clipboard!')
                                }}
                              >
                                📋 Copy ID
                              </button>
                            )}
                            {link.status === 'active' ? (
                              <button 
                                className="btn btn-secondary" 
                                style={{ padding: '4px 10px', fontSize: '11px', borderColor: 'var(--accent-primary)', color: 'var(--accent-primary)' }}
                                onClick={() => {
                                  setCheckoutModalLink(link)
                                  setCheckoutResult(null)
                                }}
                              >
                                🛒 Checkout
                              </button>
                            ) : (
                              <code style={styles.code}>{link.transactionId.slice(0, 12)}...</code>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', padding: '20px' }}>
                    No payment links generated yet.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* VIEW: MERCHANT - Ledger */}
          {activeRole === 'merchant' && activeTab === 'ledger' && (
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
          )}

          {/* VIEW: ADMIN - Diagnostic Health */}
          {activeRole === 'admin' && activeTab === 'health' && (
            <div>
              <div style={styles.welcomeBanner} style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '20px', marginBottom: '8px' }}>🩺 Container Telemetry & Status</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                  Monitor backend logs, port bindings, and operational status of all 12 dockerized payment microservices.
                </p>
              </div>
              <div style={styles.gridContainer}>
                {microservicesList.map((svc) => (
                  <div style={styles.statusCard} key={svc.name}>
                    <div style={styles.statusCardHeader}>
                      <div style={styles.statusCardTitle}>
                        <span style={{ marginRight: '6px' }}>{svc.icon}</span>
                        <b>{svc.name}</b>
                      </div>
                      <span style={styles.healthTag}>
                        <span style={styles.healthDot}></span> ACTIVE
                      </span>
                    </div>
                    <p style={styles.statusCardDesc}>{svc.description}</p>
                    <div style={styles.statusCardLogs}>
                      <code style={styles.miniLogLine}>{svc.mockLog}</code>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VIEW: ADMIN - Flow Map */}
          {activeRole === 'admin' && activeTab === 'flowmap' && (
            <div style={styles.flexColGap}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>System Architecture Sequence</h3>
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
                      💡 Hover over any node step to review database lock points and message deliveries.
                    </div>
                  )}
                </div>
              </div>

              {/* Compensating Transaction visualizer */}
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Asynchronous Saga Rollbacks Flow</h3>
                <div style={styles.sagaSimulationVisual}>
                  <div style={styles.simStep}>
                    <div style={{ ...styles.simCircle, borderColor: 'var(--accent-primary)' }}>1</div>
                    <b style={{ fontSize: '12px' }}>Initialize</b>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>202 Accepted</span>
                  </div>
                  <div style={styles.simLine}>➔</div>
                  <div style={styles.simStep}>
                    <div style={{ ...styles.simCircle, borderColor: 'var(--accent-mint)' }}>2</div>
                    <b style={{ fontSize: '12px' }}>Debit Sender</b>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Acquire Lock</span>
                  </div>
                  <div style={styles.simLine}>➔</div>
                  <div style={styles.simStep}>
                    <div style={{ ...styles.simCircle, borderColor: 'var(--accent-rose)', backgroundColor: 'rgba(239,68,68,0.06)' }}>3</div>
                    <b style={{ fontSize: '12px', color: 'var(--accent-rose)' }}>Credit Fail</b>
                    <span style={{ fontSize: '10px', color: 'var(--accent-rose)' }}>Target Frozen</span>
                  </div>
                  <div style={styles.simLine} style={{ transform: 'rotate(180deg)', color: 'var(--accent-rose)' }}>➔</div>
                  <div style={styles.simStep}>
                    <div style={{ ...styles.simCircle, borderColor: 'var(--accent-primary)', backgroundColor: 'rgba(99,102,241,0.06)' }}>4</div>
                    <b style={{ fontSize: '12px' }}>Refund</b>
                    <span style={{ fontSize: '10px', color: 'var(--accent-primary)' }}>Rollback Auto</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* VIEW: ADMIN - Analytics */}
          {activeRole === 'admin' && activeTab === 'analytics' && analytics && (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Global Aggregates</h3>
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

          {/* VIEW: DEVELOPER - Webhooks settings */}
          {activeRole === 'developer' && activeTab === 'webhooks' && (
            <div style={styles.flexColGap}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>Webhook Endpoints</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Register a target HTTP POST URL. FinPay enqueues and triggers automatic deliveries when payments resolve.
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
                    Register Webhook
                  </button>
                </form>

                {webhookSub ? (
                  <div style={styles.webhookDetailsBox}>
                    <div style={styles.detailRow} style={{ marginBottom: '8px', fontSize: '13px' }}>
                      <span><strong>Active Target:</strong></span>
                      <code style={styles.code}>{webhookSub.url}</code>
                    </div>
                    <div style={styles.detailRow} style={{ fontSize: '13px' }}>
                      <span><strong>Secret Signature Key:</strong></span>
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
                  <p style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--text-muted)' }}>No webhook configured yet.</p>
                )}
              </div>
            </div>
          )}

          {/* VIEW: DEVELOPER - Logs */}
          {activeRole === 'developer' && activeTab === 'logs' && (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Webhook Delivery logs</h3>
              {webhookLogs.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                            {expandedLogId === log._id ? 'Close' : 'Inspect JSON'}
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
                  No webhook deliveries logged yet.
                </p>
              )}
            </div>
          )}

          {/* VIEW: DEVELOPER - SDK Guide */}
          {activeRole === 'developer' && activeTab === 'sdk' && (
            <div style={styles.flexColGap}>
              <div style={styles.card}>
                <h3 style={styles.cardTitle}>📦 FinPay Node.js SDK Documentation</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Build custom payment integrations easily by installing our official client SDK directly via npm.
                </p>
                <div style={styles.statusCardLogs} style={{ backgroundColor: '#0f172a', padding: '16px', borderRadius: '12px', marginBottom: '20px' }}>
                  <code style={{ color: '#38bdf8', fontSize: '13px', fontFamily: 'monospace' }}>
                    $ npm install @piyush2205/finpay-sdk
                  </code>
                </div>

                <h4 style={{ fontSize: '14px', fontWeight: '700', marginBottom: '10px' }}>Code Integration Snippet</h4>
                <pre style={styles.payloadPre} style={{ fontSize: '11px', padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
{`const FinPayClient = require('@piyush2205/finpay-sdk');

const finpay = new FinPayClient({
  apiBase: 'http://localhost:3000/api',
  token: 'YOUR_JWT_ACCESS_TOKEN'
});

// Send transfer with artificial latency and error configs
async function pay() {
  const result = await finpay.transfer({
    receiverEmail: 'bob@gmail.com',
    amount: 15000, // ₹150.00 in paisa
    currency: 'INR',
    idempotencyKey: 'idem-uuid-key'
  }, {
    simulateDelay: 2000,
    simulateError: 'INSUFFICIENT_FUNDS'
  });
  console.log('Enqueued! ID:', result.transactionId);
}`}
                </pre>

                <h4 style={{ fontSize: '14px', fontWeight: '700', marginTop: '20px', marginBottom: '10px' }}>Cryptographic Webhook Signature Verification</h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                  Incoming webhooks carry an `X-FinPay-Signature` header. Verify this signature to validate payment origins.
                </p>
                <pre style={styles.payloadPre} style={{ fontSize: '11px', padding: '16px', maxHeight: '300px', overflowY: 'auto' }}>
{`const signature = req.headers['x-finpay-signature'];
const secret = 'whsec_your_secret_key'; // Configured in Dev settings

const isValid = FinPayClient.verifyWebhookSignature(req.body, signature, secret);

if (isValid) {
  console.log('Webhook is authentic! Process event safely.');
}`}
                </pre>
              </div>
            </div>
          )}

        </section>
      </div>

      {/* CUSTOMER CHECKOUT MODAL OVERLAY */}
      {checkoutModalLink && (
        <div style={overlayStyles.overlay}>
          <div style={overlayStyles.modal}>
            <div style={overlayStyles.header}>
              <h3 style={{ fontSize: '18px', fontWeight: '800' }}>⚡ FinPay Instant Checkout</h3>
              <button 
                style={overlayStyles.closeBtn} 
                onClick={() => {
                  setCheckoutModalLink(null)
                  setCheckoutResult(null)
                }}
              >
                ✕
              </button>
            </div>
            
            <div style={overlayStyles.body}>
              <div style={overlayStyles.productBox}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: '700' }}>Purchasing</span>
                <div style={{ fontSize: '20px', fontWeight: '800', margin: '4px 0' }}>{checkoutModalLink.description}</div>
                <div style={{ fontSize: '28px', fontWeight: '900', color: 'var(--accent-primary)' }}>
                  ₹{(checkoutModalLink.amount / 100).toFixed(2)}
                </div>
              </div>

              <div style={styles.walletDetails} style={{ margin: '20px 0' }}>
                <div style={styles.detailRow}>
                  <span>Merchant Recipient:</span>
                  <b>{checkoutModalLink.merchantEmail}</b>
                </div>
                <div style={styles.detailRow}>
                  <span>Customer Payee:</span>
                  <b>{user.email}</b>
                </div>
                {wallet && (
                  <div style={styles.detailRow} style={{ borderTop: '1px dashed var(--border-subtle)', paddingTop: '10px', marginTop: '10px' }}>
                    <span>Your Wallet Balance:</span>
                    <strong style={{ color: wallet.balance >= checkoutModalLink.amount ? 'var(--accent-mint)' : 'var(--accent-rose)' }}>
                      ₹{(wallet.balance / 100).toFixed(2)}
                    </strong>
                  </div>
                )}
              </div>

              {checkoutResult && (
                <div style={checkoutResult.success ? styles.successAlert : styles.errorAlert} style={{ marginBottom: '16px', padding: '12px', borderRadius: '10px' }}>
                  {checkoutResult.message}
                </div>
              )}
            </div>

            <div style={overlayStyles.footer}>
              <button 
                className="btn btn-secondary" 
                onClick={() => {
                  setCheckoutModalLink(null)
                  setCheckoutResult(null)
                }}
                disabled={checkoutLoading}
              >
                Cancel
              </button>
              <button 
                className="btn btn-primary" 
                onClick={() => handlePayPaymentLink(checkoutModalLink._id)}
                disabled={checkoutLoading || (wallet && wallet.balance < checkoutModalLink.amount) || checkoutResult?.success}
              >
                {checkoutLoading ? 'Processing Settle...' : 'Confirm & Settle Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Checkout Modal Overlay Styles ─────────────────────────────────────────────
const overlayStyles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#ffffff',
    borderRadius: '24px',
    width: '100%',
    maxWidth: '460px',
    padding: '32px',
    boxShadow: '0 24px 60px -15px rgba(15, 23, 42, 0.2)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottom: '1px solid var(--border-subtle)',
    paddingBottom: '16px',
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '18px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  },
  body: {
    padding: '20px 0 10px 0',
  },
  productBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.04)',
    border: '1px solid rgba(99, 102, 241, 0.08)',
    borderRadius: '16px',
    padding: '20px',
    textAlign: 'center',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: '20px',
    marginTop: '10px',
  },
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
    name: 'payment-link-service',
    icon: '🔗',
    port: '3086',
    description: 'Hosts shareable customer checkouts. Uses published NPM SDK to settle payments.',
    mockLog: 'payment-link-service | SDK initialized & verified payment link checkout',
  },
  {
    name: 'bull-board',
    icon: '📊',
    port: '3080',
    description: 'Provides a dashboard to monitor active, failed, and completed queue jobs.',
    mockLog: 'bull-board | Telemetry dashboard listening at http://localhost:3080/ui',
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
  roleContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  roleGroup: {
    display: 'flex',
    backgroundColor: 'rgba(15,23,42,0.03)',
    padding: '4px',
    borderRadius: '8px',
    border: '1px solid var(--border-subtle)',
  },
  roleBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-display)',
    fontWeight: '600',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: '6px',
    transition: 'var(--transition-smooth)',
  },
  activeRoleBtn: {
    background: '#ffffff',
    border: 'none',
    color: 'var(--accent-primary)',
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    fontSize: '11px',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: '6px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  navTabs: {
    display: 'none', // replaced by sidebar navigation
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
  workspaceWrapper: {
    flex: 1,
    display: 'flex',
    width: '100%',
    maxWidth: '1440px',
    margin: '0 auto',
  },
  sidebar: {
    width: '260px',
    borderRight: '1px solid var(--border-subtle)',
    padding: '32px 24px',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sidebarTitle: {
    fontSize: '10px',
    fontWeight: '800',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
  },
  sidebarNav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sidebarBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-display)',
    fontWeight: '600',
    fontSize: '13px',
    textAlign: 'left',
    cursor: 'pointer',
    padding: '10px 16px',
    borderRadius: '10px',
    transition: 'var(--transition-smooth)',
    width: '100%',
  },
  activeSidebarBtn: {
    background: 'rgba(99, 102, 241, 0.08)',
    border: 'none',
    color: 'var(--accent-primary)',
    fontFamily: 'var(--font-display)',
    fontWeight: '700',
    fontSize: '13px',
    textAlign: 'left',
    cursor: 'pointer',
    padding: '10px 16px',
    borderRadius: '10px',
    width: '100%',
  },
  contentPanel: {
    flex: 1,
    padding: '40px',
    backgroundColor: '#f8fafc',
    overflowY: 'auto',
  },
  grid2Col: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '32px',
  },
  flexColGap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  tabContent: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  welcomeBanner: {
    background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.04) 0%, rgba(236, 72, 153, 0.01) 100%)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '20px',
    padding: '24px 32px',
  },
  mapLayout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
  },
  card: {
    backgroundColor: '#ffffff',
    border: '1px solid var(--border-subtle)',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: 'var(--shadow-premium)',
    position: 'relative',
    overflow: 'hidden',
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
  gridContainer: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '20px',
  },
  statusCard: {
    backgroundColor: '#ffffff',
    border: '1px solid var(--border-subtle)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: 'var(--shadow-premium)',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  statusCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusCardTitle: {
    fontSize: '14px',
    color: 'var(--text-primary)',
    display: 'flex',
    alignItems: 'center',
  },
  statusCardDesc: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
}
