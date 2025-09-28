const { createEnquirySchema, updateEnquirySchema, statusPatchSchema, followUpPatchSchema, listQuerySchema } = require('../src/utils/enquiryValidation');

describe('Enquiry validation', () => {
  const valid = {
    contact_no: '9110178227',
    country_code: '+91',
    name: 'Pawan Kumar',
    gender: 'male',
    email: 'pawan@example.com',
    source: 'instagram',
    enquiry_type: 'hot',
    enquiry_status: 'pending',
    notes: 'note',
    follow_up_at: '2025-09-20T05:00:00.000Z',
    enquiry_details: [ { category: 'service', name: 'Haircut', reference_id: 'svc-uuid-1' } ]
  };

  it('create: accepts valid payload', () => {
    const { error } = createEnquirySchema.validate(valid);
    expect(error).toBeUndefined();
  });

  it('create: rejects bad enums', () => {
    const bad = { ...valid, gender: 'x', source: 'y', enquiry_type: 'z', enquiry_status: 'w' };
    const { error } = createEnquirySchema.validate(bad);
    expect(error).toBeTruthy();
  });

  it('update: optional fields and details array', () => {
    const { error } = updateEnquirySchema.validate({ enquiry_status: 'converted', enquiry_details: valid.enquiry_details });
    expect(error).toBeUndefined();
  });

  it('status patch: requires valid status', () => {
    expect(statusPatchSchema.validate({ enquiry_status: 'pending' }).error).toBeUndefined();
    expect(statusPatchSchema.validate({ enquiry_status: 'nope' }).error).toBeTruthy();
  });

  it('follow up patch: allows null', () => {
    expect(followUpPatchSchema.validate({ follow_up_at: null }).error).toBeUndefined();
  });

  it('list query: parses includeDeleted booleans', () => {
    expect(listQuerySchema.validate({ includeDeleted: 'true' }).value.includeDeleted).toBe(true);
  });
});
