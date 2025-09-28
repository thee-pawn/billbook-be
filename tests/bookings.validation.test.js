const Joi = require('joi');
const {
  createBookingSchema,
  updateBookingSchema,
  statusPatchSchema,
  listQuerySchema
} = require('../src/utils/bookingValidation');

describe('Booking Validation Schemas', () => {
  const base = {
    customer_id: null,
    country_code: '+91',
    contact_no: '9876543210',
    customer_name: 'John Doe',
    gender: 'male',
    email: 'john@example.com',
    address: 'Addr',
    booking_datetime: new Date().toISOString(),
    venue_type: 'indoor',
    remarks: '',
    advance_amount: 100,
    payment_mode: 'cash',
    items: [
      { service_id: '550e8400-e29b-41d4-a716-446655440000', service_name: 'Haircut', unit_price: 300, quantity: 1 }
    ]
  };

  test('createBookingSchema valid payload', () => {
    const { error } = createBookingSchema.validate(base);
    expect(error).toBeUndefined();
  });

  test('updateBookingSchema requires items non-empty', () => {
    const { error } = updateBookingSchema.validate({ ...base, items: [] });
    expect(error).toBeDefined();
  });

  test('statusPatchSchema valid enum', () => {
    expect(statusPatchSchema.validate({ status: 'scheduled' }).error).toBeUndefined();
    expect(statusPatchSchema.validate({ status: 'foo' }).error).toBeDefined();
  });

  test('listQuerySchema pagination defaults', () => {
    const { value, error } = listQuerySchema.validate({});
    expect(error).toBeUndefined();
    expect(value.page).toBe(1);
    expect(value.limit).toBe(20);
  });
});
