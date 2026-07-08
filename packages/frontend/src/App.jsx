import React, { useState, useEffect, useRef } from 'react'

// Simple helper to generate UUIDs for Idempotency Keys
function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Gateway base URL — during local/Docker running, we talk to port 3000
const API_BASE = 'http://localhost:3000/api'

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '')
  const [user, setUser] = useState(null)
  
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

  // Saga Polling / Processing State
  const [processingTx, setProcessingTx] = useState(null)
  const pollTimerRef = useRef(null)

  // Load User Data & Token Validation
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

  // Load wallet & transactions once user is loaded
  useEffect(() => {
    if (user) {
      fetchWallet()
      fetchTransactions(1)
      fetchAnalytics()
    }
  }, [user])

  // Clear timers on unmount
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
        setWallet(null) // No wallet created yet
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
        // Automatically switch to login on success signup
        setIsRegister(false)
        setAuthError('Registration successful! Please login.')
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
      // POST returns 202 Accepted + status PENDING
      const res = await fetch(`${API_BASE}/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'Idempotency-Key': idemKey
        },
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

      // Start asynchronous saga tracking
      setProcessingTx({
        id: data.transactionId,
        status: data.status || 'PENDING',
        amount: data.amount,
        receiver: recipientEmail,
      })

      // Setup Poller to monitor Saga execution progress
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
            setTransferSuccess(`Successfully transferred ₹${(data.amount / 100).toFixed(2)} to ${recipientEmail}!`)
            setRecipientEmail('')
            setAmount('')
          } else {
            setTransferError(`Transfer failed: ${data.failureReason || 'Declined by banking core'}`)
          }

          // Refresh states
          fetchWallet()
          fetchTransactions(1)
          fetchAnalytics()
        }
      } catch (err) {
        console.error('Polling error', err)
      }
    }, 800) // Poll every 800ms
  }

  // ── Render Helpers ────────────────────────────────────────────────────────────

  if (!token || !user) {
    // ── Authentication view ──────────────────────────────────────────────────────
    return (
      <div style={styles.authContainer}>
        <div style={styles.authCard}>
          <div style={styles.brandTitle}>
            <span style={styles.brandSymbol}>⚡</span> FinPay
          </div>
          <p style={styles.authSub}>Premium Payments Core Engine</p>

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

  // ── Main Dashboard view ────────────────────────────────────────────────────────
  return (
    <div style={styles.dashboardLayout}>
      {/* Sidebar Header */}
      <header style={styles.navBar} className="nav-glass">
        <div style={styles.navContent}>
          <div style={styles.navBrand}>
            <span style={styles.brandSymbol}>⚡</span> FinPay
          </div>
          
          <div style={styles.userProfile}>
            <div style={styles.avatar}>
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

      {/* Main dashboard body */}
      <main style={styles.mainGrid}>
        
        {/* Left Column: Wallet Balance & Transfer */}
        <section style={styles.leftCol}>
          
          {/* Wallet Balance Card */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Wallet Balance</h3>
            
            {walletLoading ? (
              <div style={styles.loaderPlaceholder}>Loading secure ledger details...</div>
            ) : wallet ? (
              <div style={styles.walletContent}>
                <div style={styles.balanceBig}>
                  ₹{(wallet.balance / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={styles.walletDetails}>
                  <div style={styles.detailRow}>
                    <span>Wallet ID:</span>
                    <code style={styles.code}>{wallet.walletId}</code>
                  </div>
                  <div style={styles.detailRow}>
                    <span>Status:</span>
                    <span className="badge badge-success">{wallet.status}</span>
                  </div>
                  <button
                    className="btn btn-secondary"
                    style={{ width: '100%', marginTop: '16px', fontSize: '12px' }}
                    onClick={fundWalletDemo}
                  >
                    💰 Add Mock ₹1,000.00
                  </button>
                </div>
              </div>
            ) : (
              <div style={styles.noWalletBox}>
                <p style={styles.noWalletText}>No digital wallet exists for this account.</p>
                <button className="btn btn-primary" onClick={createWallet}>
                  Create Active Wallet
                </button>
              </div>
            )}
          </div>

          {/* Money Transfer Card */}
          <div style={styles.card}>
            <h3 style={styles.cardTitle}>Send Money</h3>
            
            {wallet ? (
              <form onSubmit={handleTransferSubmit} style={styles.transferForm}>
                <div style={styles.formGroup}>
                  <label style={styles.label}>Receiver Email</label>
                  <input
                    type="email"
                    placeholder="receiver@domain.com"
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

                {/* Saga Status Progress Box */}
                {processingTx && (
                  <div style={styles.sagaProgressBox}>
                    <div style={styles.sagaRow}>
                      <span style={styles.spinner}></span>
                      <span>
                        Saga Transaction: <code style={styles.code}>{processingTx.id}</code>
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
        </section>

        {/* Right Column: Analytics & Ledger History */}
        <section style={styles.rightCol}>
          
          {/* Analytics Summary */}
          {analytics && (
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Monthly Activity Analytics ({analytics.period})</h3>
              <div style={styles.analyticsGrid}>
                <div style={styles.statBox}>
                  <span style={styles.statLabel}>Total Sent</span>
                  <span style={styles.statValue}>₹{(analytics.totalSent / 100).toFixed(2)}</span>
                </div>
                <div style={styles.statBox}>
                  <span style={styles.statLabel}>Total Received</span>
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

              {/* Simple CSS Chart Graphic */}
              <div style={styles.graphicChart}>
                <div style={{ ...styles.chartBar, height: '40%', backgroundColor: 'var(--accent-primary)' }} title="Sent"></div>
                <div style={{ ...styles.chartBar, height: '70%', backgroundColor: 'var(--accent-mint)' }} title="Received"></div>
                <div style={{ ...styles.chartBar, height: '15%', backgroundColor: 'var(--accent-rose)' }} title="Failed"></div>
              </div>
            </div>
          )}

          {/* Transactions History List */}
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
                              <span style={{ color: 'var(--accent-rose)' }}>▲ Outbound</span>
                            ) : (
                              <span style={{ color: 'var(--accent-mint)' }}>▼ Inbound</span>
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

                {/* Pagination */}
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

          {/* Admin Queue Link */}
          <div style={styles.adminFooter}>
            ⚙️ System Dashboard: <a href="http://localhost:3010/ui" target="_blank" rel="noopener noreferrer" style={styles.footerLink}>Monitor BullMQ queue statuses on Bull Board</a>
          </div>

        </section>
      </main>
    </div>
  )
}

// ── Styles (Premium CSS-in-JS Layout Rules) ───────────────────────────────────
const styles = {
  authContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: '24px',
    backgroundColor: '#070a10',
  },
  authCard: {
    width: '100%',
    maxWidth: '420px',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '24px',
    padding: '40px',
    boxShadow: 'var(--shadow-premium)',
  },
  brandTitle: {
    fontSize: '28px',
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: '4px',
    fontFamily: 'var(--font-display)',
  },
  brandSymbol: {
    color: 'var(--accent-primary)',
    textShadow: '0 0 10px rgba(99, 102, 241, 0.4)',
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
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  errorAlert: {
    backgroundColor: 'rgba(244, 63, 94, 0.1)',
    border: '1px solid rgba(244, 63, 94, 0.2)',
    color: 'var(--accent-rose)',
    padding: '12px',
    borderRadius: '12px',
    fontSize: '13px',
  },
  successAlert: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
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
  navBar: {
    position: 'sticky',
    top: 0,
    zIndex: 50,
    width: '100%',
    padding: '16px 40px',
  },
  navContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    maxWidth: '1200px',
    margin: '0 auto',
    width: '100%',
  },
  navBrand: {
    fontSize: '22px',
    fontWeight: '800',
    fontFamily: 'var(--font-display)',
  },
  userProfile: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  avatar: {
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    border: '1px solid rgba(99, 102, 241, 0.3)',
    color: 'var(--accent-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: '700',
  },
  userInfo: {
    display: 'none',
    flexDirection: 'column',
    textAlign: 'left',
    '@media (min-width: 640px)': {
      display: 'flex',
    }
  },
  userName: {
    fontSize: '13px',
    fontWeight: '600',
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
    padding: '40px',
    display: 'grid',
    gridTemplateColumns: 'repeat(12, 1fr)',
    gap: '32px',
  },
  leftCol: {
    gridColumn: 'span 12',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    '@media (min-width: 1024px)': {
      gridColumn: 'span 5',
    }
  },
  rightCol: {
    gridColumn: 'span 12',
    display: 'flex',
    flexDirection: 'column',
    gap: '32px',
    '@media (min-width: 1024px)': {
      gridColumn: 'span 7',
    }
  },
  card: {
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '20px',
    padding: '32px',
    boxShadow: 'var(--shadow-premium)',
  },
  cardTitle: {
    fontSize: '15px',
    fontWeight: '700',
    color: 'var(--text-secondary)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '24px',
  },
  balanceBig: {
    fontSize: '44px',
    fontWeight: '800',
    color: '#fff',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.03em',
    marginBottom: '20px',
  },
  walletDetails: {
    borderTop: '1px solid var(--border-subtle)',
    paddingTop: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  detailRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
  },
  code: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    padding: '4px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#fff',
  },
  loaderPlaceholder: {
    color: 'var(--text-muted)',
    fontSize: '14px',
    textAlign: 'center',
    padding: '20px',
  },
  noWalletBox: {
    textAlign: 'center',
    padding: '20px 0',
  },
  noWalletText: {
    color: 'var(--text-secondary)',
    fontSize: '14px',
    marginBottom: '20px',
  },
  transferForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  sagaProgressBox: {
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    border: '1px solid rgba(99, 102, 241, 0.15)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
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
    color: 'var(--text-muted)',
  },
  spinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(99, 102, 241, 0.2)',
    borderTopColor: 'var(--accent-primary)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  analyticsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '16px',
  },
  statBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '12px',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  statLabel: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#fff',
  },
  graphicChart: {
    marginTop: '24px',
    height: '60px',
    display: 'flex',
    alignItems: 'flex-end',
    gap: '12px',
    padding: '8px 0',
    borderBottom: '1px solid var(--border-subtle)',
  },
  chartBar: {
    flex: 1,
    borderRadius: '4px 4px 0 0',
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
    padding: '12px 16px',
    color: 'var(--text-muted)',
    borderBottom: '1px solid var(--border-subtle)',
    fontWeight: '600',
  },
  tr: {
    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
  },
  td: {
    padding: '14px 16px',
    color: 'var(--text-primary)',
  },
  pagination: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '20px',
  },
  emptyTableText: {
    color: 'var(--text-muted)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px',
  },
  adminFooter: {
    textAlign: 'center',
    fontSize: '12px',
    color: 'var(--text-muted)',
    marginTop: '10px',
  },
  footerLink: {
    color: 'var(--accent-primary)',
    textDecoration: 'none',
    fontWeight: '600',
  }
}
