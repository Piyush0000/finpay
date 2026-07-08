const authService = require('../services/auth.service')
const tokenService = require('../services/token.service')

const authController = {
  async register(req, res, next) {
    try {
      const { name, email, password } = req.body
      const user = await authService.register(name, email, password)
      res.status(201).json({ userId: user._id, name: user.name, email: user.email })
    } catch (err) {
      next(err)
    }
  },

  async login(req, res, next) {
    try {
      const { email, password } = req.body
      const user = await authService.login(email, password)
      const accessToken = tokenService.generateAccessToken(user)
      const refreshToken = await tokenService.generateRefreshToken(user._id)
      res.json({
        accessToken,
        refreshToken,
        user: { id: user._id, name: user.name, email: user.email },
      })
    } catch (err) {
      next(err)
    }
  },

  async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body
      const { newToken, userId } = await tokenService.rotateRefreshToken(refreshToken)
      const user = await authService.getUserById(userId)
      const accessToken = tokenService.generateAccessToken(user)
      res.json({ accessToken, refreshToken: newToken })
    } catch (err) {
      next(err)
    }
  },

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.body
      await tokenService.revokeRefreshToken(refreshToken)
      res.status(204).send()
    } catch (err) {
      next(err)
    }
  },

  async me(req, res, next) {
    try {
      const authHeader = req.headers.authorization
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Missing token' } })
      }
      const token = authHeader.slice(7)
      const payload = tokenService.verifyAccessToken(token)
      const user = await authService.getUserById(payload.sub)
      res.json({ id: user._id, name: user.name, email: user.email, status: user.status })
    } catch (err) {
      next(err)
    }
  },
}

module.exports = authController
