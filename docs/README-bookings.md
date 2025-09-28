# Bookings Module

This module manages bookings with header and items. Totals are computed server-side.

Endpoints (all under `/api/v1` and require Bearer auth):

- `POST /store/{storeId}/bookings` - Create booking
- `GET /store/{storeId}/bookings` - List bookings
- `GET /store/{storeId}/bookings/{bookingId}` - Get booking
- `PUT /store/{storeId}/bookings/{bookingId}` - Update booking (replaces items)
- `PATCH /store/{storeId}/bookings/{bookingId}/status` - Update status
- `DELETE /store/{storeId}/bookings/{bookingId}` - Soft delete

Validation
- Input validated with Joi in `src/utils/bookingValidation.js`
- Status enum: `scheduled | in-progress | completed | cancelled`

Data Model
- `bookings` and `booking_items` tables; see migration `V39__Create_bookings_tables.sql`.

OpenAPI
- Spec at `docs/openapi/bookings.yaml`.

Notes
- Totals computed: `total_amount = sum(unit_price * quantity)`; `payable_amount = total_amount - advance_amount`.
- Phone is stored as `country_code`, `contact_no`, and concatenated `phone_number`.
