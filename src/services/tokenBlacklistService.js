// Token Blacklist Service
// In production, consider using Redis or database for persistence
class TokenBlacklistService {
  constructor() {
    // In-memory storage for blacklisted tokens
    // In production, use Redis or database for persistence across server restarts
    this.blacklistedTokens = new Set();
    
    // Clean up expired tokens every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 60 * 1000); // 1 hour
  }

  // Add token to blacklist
  blacklistToken(token) {
    this.blacklistedTokens.add(token);
    console.log(`🚫 Token blacklisted: ${token.substring(0, 10)}...`);
  }

  // Check if token is blacklisted
  isTokenBlacklisted(token) {
    return this.blacklistedTokens.has(token);
  }

  // Get blacklist size (for monitoring)
  getBlacklistSize() {
    return this.blacklistedTokens.size;
  }

  // Clean up expired tokens (basic cleanup)
  cleanupExpiredTokens() {
    const jwt = require('jsonwebtoken');
    const config = require('../config/config');
    
    let cleanedCount = 0;
    for (const token of this.blacklistedTokens) {
      try {
        // Try to verify token - if it throws an error, it's expired
        jwt.verify(token, config.jwt.secret);
      } catch (error) {
        // Token is expired or invalid, remove from blacklist
        this.blacklistedTokens.delete(token);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired tokens from blacklist`);
    }
  }

  // Clear all blacklisted tokens (for testing or maintenance)
  clearBlacklist() {
    const size = this.blacklistedTokens.size;
    this.blacklistedTokens.clear();
    console.log(`🗑️  Cleared ${size} tokens from blacklist`);
  }

  // Graceful shutdown
  shutdown() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

module.exports = new TokenBlacklistService();
