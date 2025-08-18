const request = require('supertest');
const app = require('../server');

describe('Billbook Backend API', () => {
  describe('GET /', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Billbook Backend API');
      expect(response.body.version).toBeDefined();
      expect(response.body.environment).toBeDefined();
    });
  });

  describe('GET /api/v1/info', () => {
    it('should return API info', async () => {
      const response = await request(app)
        .get('/api/v1/info')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Billbook Backend API');
      expect(response.body.data.endpoints).toBeDefined();
    });
  });

  describe('GET /api/v1/health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/v1/health');

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('OK');
      expect(response.body.data.services).toBeDefined();
      expect(response.body.data.services.database).toBeDefined();
      expect(response.body.data.services.s3).toBeDefined();
    });
  });

  describe('404 Routes', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/api/v1/unknown-route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Route not found');
    });
  });
});

describe('Authentication Routes', () => {
  describe('POST /api/v1/auth/register', () => {
    it('should require valid input', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'invalid-email',
          password: 'password123',
          name: 'Test User'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('should require valid input', async () => {
      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation error');
    });
  });
});
