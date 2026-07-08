const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { ConflictError, UnauthorizedError, NotFoundError } = require('@finpay/shared');

class AuthService {
  async register(name, email, password) {
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new ConflictError('Email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await User.create({
      name,
      email,
      passwordHash,
    });

    return user;
  }

  async login(email, password) {
    const user = await User.findOne({ email });

    if (!user) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isMatch) {
      throw new UnauthorizedError('Invalid email or password');
    }

    return user;
  }

  async getUserById(userId) {
    const user = await User.findById(userId);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }
}

module.exports = new AuthService();