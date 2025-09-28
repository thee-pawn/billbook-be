const request = require('supertest');
const app = require('../server');

describe('Bookings API - Authentication', () => {
  test('POST /api/v1/store/:storeId/bookings requires auth', async () => {
    const res = await request(app)
      .post('/api/v1/store/550e8400-e29b-41d4-a716-446655440000/bookings')
      .send({});
    expect([401, 403]).toContain(res.statusCode);
  });

  test('GET /api/v1/store/:storeId/bookings requires auth', async () => {
    const res = await request(app)
      .get('/api/v1/store/550e8400-e29b-41d4-a716-446655440000/bookings');
    expect([401, 403]).toContain(res.statusCode);
  });
});
