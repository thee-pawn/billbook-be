const request = require('supertest');
const app = require('../server');

describe('Enquiries API (unauthenticated)', () => {
  it('POST /api/v1/enquiries/:storeId requires auth', async () => {
    const res = await request(app).post('/api/v1/enquiries/00000000-0000-0000-0000-000000000000').send({});
    expect([401,403]).toContain(res.statusCode);
  });

  it('GET /api/v1/enquiries/:storeId requires auth', async () => {
    const res = await request(app).get('/api/v1/enquiries/00000000-0000-0000-0000-000000000000');
    expect([401,403]).toContain(res.statusCode);
  });
});
