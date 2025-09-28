// Rate limiting disabled: no-op middlewares
const noop = (req, res, next) => next();

module.exports = {
  generalLimiter: noop,
  authLimiter: noop,
  uploadLimiter: noop,
  businessLimiter: noop
};
