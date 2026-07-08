const { createProxyMiddleware } = require('http-proxy-middleware')
const config = require('../config')

function setupRoutes(app, jwtVerify) {
  const proxyOpts = { changeOrigin: true }

  // auth routes — no JWT required
  // Express strips '/api/auth' prefix → proxy sees '/register', '/login', etc.
  // pathRewrite '^' prepends '/auth' → '/auth/register', '/auth/login', etc.
  app.use(
    '/api/auth',
    createProxyMiddleware({
      ...proxyOpts,
      target: config.authServiceUrl,
      pathRewrite: { '^': '/auth' },
    })
  )

  // all routes below require JWT
  app.use(jwtVerify)

  // Express strips '/api/wallets' → proxy sees '/me', '/', etc.
  // pathRewrite prepends '/wallets' back
  app.use(
    '/api/wallets',
    createProxyMiddleware({
      ...proxyOpts,
      target: config.walletServiceUrl,
      pathRewrite: { '^': '/wallets' },
    })
  )

  // Express strips '/api/transfers' → proxy sees '/', '/:id', etc.
  // pathRewrite prepends '/transfers' back
  app.use(
    '/api/transfers',
    createProxyMiddleware({
      ...proxyOpts,
      target: config.transactionServiceUrl,
      pathRewrite: { '^': '/transfers' },
    })
  )

  // Express strips '/api/analytics' → proxy sees '/summary', etc.
  // pathRewrite prepends '/analytics' back
  app.use(
    '/api/analytics',
    createProxyMiddleware({
      ...proxyOpts,
      target: config.analyticsServiceUrl,
      pathRewrite: { '^': '/analytics' },
    })
  )
}

module.exports = { setupRoutes }
