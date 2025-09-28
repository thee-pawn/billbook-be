# Frontend API Prompt: Enquiries, Appointments, Bookings

Base URL: `/api/v1`
Auth: All endpoints require `Authorization: Bearer <JWT>` unless stated.
Store scope: Many endpoints are under `/store/{storeId}`; include your current store’s UUID.

Common response shape:
{
  success: boolean,
  message: string,
  data?: object
}

============================
SECTION A: ENQUIRIES
============================

1) Create Enquiry
POST `/enquiries/{storeId}`
Body:
{
  "country_code": "+91",
  "contact_no": "9876543210",
  "name": "Jane Doe",
  "email": "jane@example.com",
  "gender": "female",
  "source": "instagram",            // e.g., website|walk-in|phone|instagram|facebook|google
  "enquiry_type": "service",        // e.g., product|service|membership
  "enquiry_status": "new",          // e.g., new|in-progress|converted|closed
  "notes": "Looking for bridal package",
  "follow_up_at": "2025-09-30T10:30:00.000Z",
  "enquiry_details": [
    { "category": "service", "name": "Bridal Makeup", "reference_id": "<service-uuid>" }
  ]
}
Response 201:
{
  "success": true,
  "message": "Enquiry created",
  "data": { "enquiry": { ... }, "details": [ ... ] }
}

2) List Enquiries
GET `/enquiries/{storeId}?page=1&limit=20&q=Jane&status=new&type=service&source=instagram&from=2025-09-01&to=2025-09-30`
Response 200:
{
  "success": true,
  "message": "Enquiries retrieved",
  "data": {
    "enquiries": [ { ... } ],
    "pagination": { "page": 1, "limit": 20, "total": 1, "pages": 1 }
  }
}

3) Get Enquiry
GET `/enquiries/{storeId}/{enquiryId}`
Response 200:
{
  "success": true,
  "message": "Enquiry retrieved",
  "data": { "enquiry": { ... }, "details": [ ... ] }
}

4) Update Enquiry (replace details)
PUT `/enquiries/{storeId}/{enquiryId}`
Body: same shape as Create; `enquiry_details` optional (replace when sent)

5) Patch Status
PATCH `/enquiries/{storeId}/{enquiryId}/status`
Body:
{ "enquiry_status": "converted" }

6) Patch Follow-up Time
PATCH `/enquiries/{storeId}/{enquiryId}/follow-up`
Body:
{ "follow_up_at": "2025-10-01T09:00:00.000Z" }

7) Soft Delete
DELETE `/enquiries/{storeId}/{enquiryId}`

Notes:
- Customer auto-linking: server links an existing customer by phone (`country_code` + `contact_no`) within store when present.
- All timestamps are ISO strings.

============================
SECTION B: APPOINTMENTS
============================

1) Create Appointment
POST `/store/{storeId}/appointments`
Body:
{
  "phoneNumber": "+919876543210",      // full phone string
  "customerName": "John Doe",
  "gender": "male",                    // optional
  "source": "walk-in",                 // optional
  "date": "2025-09-20",               // YYYY-MM-DD
  "time": "14:30",                     // HH:mm (24h)
  "status": "scheduled",               // scheduled|in-progress|completed|cancelled
  "services": [
    { "serviceId": "<uuid>", "staffId": "<uuid>", "position": 0 }
  ],
  "totalDurationMinutes": 90,
  "totalAmount": 1200,
  "advanceAmount": 200,
  "payableAmount": 1000,
  "paymentMode": "cash",               // optional
  "notes": "VIP"
}
Response 201: { success, message, data: { appointment: { ...computed fields } } }

2) List Appointments
GET `/store/{storeId}/appointments?date=2025-09-20&status=scheduled&page=1&limit=20`

3) Get Appointment
GET `/store/{storeId}/appointments/{appointmentId}`

4) Update Appointment
PUT `/store/{storeId}/appointments/{appointmentId}`
Body: same shape as Create; replaces services array.

Notes:
- Customer identification: server tries to link an existing customer by `phoneNumber` within the same store.
- `time` returns as HH:mm, and totals are echoed back from DB.

============================
SECTION C: BOOKINGS
============================

1) Create Booking
POST `/store/{storeId}/bookings`
Body:
{
  "customer_id": null,                   // optional, server will also attempt to match by phone
  "country_code": "+91",
  "contact_no": "9876543210",
  "customer_name": "Alice",
  "gender": "female",                  // male|female|other
  "email": "alice@example.com",        // optional
  "address": "123 Street",             // optional
  "booking_datetime": "2025-09-25T10:00:00.000Z",
  "venue_type": "indoor",              // indoor|outdoor
  "remarks": "Birthday party",         // optional
  "advance_amount": 200,                // defaults 0
  "payment_mode": "cash",              // cash|card|online
  "items": [
    {
      "service_id": "<uuid>",
      "service_name": "Makeup",
      "unit_price": 800,
      "staff_id": null,
      "staff_name": null,
      "quantity": 1,
      "scheduled_at": null,
      "venue": "Hall A"
    }
  ]
}
Response 201:
{
  "success": true,
  "message": "Booking created",
  "data": { "booking": { ... }, "items": [ ... ] }
}

Notes:
- Server computes totals: `total_amount = sum(unit_price * quantity)`, `payable_amount = total_amount - advance_amount`.
- Phone is stored as `country_code + contact_no` and also expanded to `phone_number`.

2) List Bookings
GET `/store/{storeId}/bookings?page=1&limit=20&status=scheduled&from=2025-09-01T00:00:00.000Z&to=2025-09-30T23:59:59.999Z&search=Alice`
Response 200:
{
  "success": true,
  "message": "Bookings fetched",
  "data": { "data": [ { ... } ], "page": 1, "limit": 20, "total": 1 }
}

3) Get Booking
GET `/store/{storeId}/bookings/{bookingId}`
Response 200:
{
  "success": true,
  "message": "Booking fetched",
  "data": { "booking": { ... }, "items": [ ... ] }
}

4) Update Booking (replace items)
PUT `/store/{storeId}/bookings/{bookingId}`
Body: same as Create; replaces the `items` collection transactionally.

5) Update Booking Status
PATCH `/store/{storeId}/bookings/{bookingId}/status`
Body:
{ "status": "completed" }  // scheduled|in-progress|completed|cancelled

6) Delete (Soft)
DELETE `/store/{storeId}/bookings/{bookingId}`

============================
AUTH AND HEADERS
============================
- Headers for all requests:
  - `Content-Type: application/json`
  - `Authorization: Bearer <JWT>`

============================
EXAMPLES (cURL)
============================
- Create Enquiry:
  curl -X POST "$BASE/api/v1/enquiries/$STORE_ID" \
       -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
       -d '{"country_code":"+91","contact_no":"9876543210","name":"Jane","gender":"female","enquiry_type":"service","enquiry_status":"new","enquiry_details":[{"category":"service","name":"Bridal"}]}'

- Create Appointment:
  curl -X POST "$BASE/api/v1/store/$STORE_ID/appointments" \
       -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
       -d '{"phoneNumber":"+919876543210","customerName":"John","date":"2025-09-20","time":"14:30","services":[{"serviceId":"'$SERVICE_ID'"}],"totalDurationMinutes":60,"totalAmount":800,"advanceAmount":100,"payableAmount":700}'

- Create Booking:
  curl -X POST "$BASE/api/v1/store/$STORE_ID/bookings" \
       -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
       -d '{"country_code":"+91","contact_no":"9876543210","customer_name":"Alice","gender":"female","booking_datetime":"2025-09-25T10:00:00.000Z","venue_type":"indoor","payment_mode":"cash","items":[{"service_id":"'$SERVICE_ID'","service_name":"Makeup","unit_price":800,"quantity":1}]}'

============================
ERRORS & VALIDATION
============================
- All endpoints validate inputs and return 400 with details when invalid.
- 401/403 for unauthenticated or unauthorized access.
- 404 for missing `enquiryId`/`appointmentId`/`bookingId`.

Please coordinate on enumerations (status/source/type) and provide UUIDs for store, services, staff, and references.


============================
SECTION D: CUSTOMER NOTES
============================

Base path: `/api/v1/customers`

Auth: Send `Authorization: Bearer <JWT>` header for all requests.

Model:
{ id: string, customerId: string, note: string, starred: boolean, created_at: ISODate, updated_at: ISODate }

1) Create Note
POST `/customers/{storeId}/{customerId}/notes`
Body:
{ "note": "Follow-up after service", "starred": true }
Response 201:
{ success, message, data: { note: { ... } } }

2) Update Note
PUT `/customers/{storeId}/{customerId}/notes/{noteId}`
Body (any of):
{ "note": "Updated note text", "starred": false }
Response 200:
{ success, message, data: { note: { ... } } }

3) List Notes
GET `/customers/{storeId}/{customerId}/notes`
Response 200:
{ success, message, data: { notes: [ ... ] } }

4) Delete Note
DELETE `/customers/{storeId}/{customerId}/notes/{noteId}`
Response 200:
{ success, message }

Notes are ordered with starred ones first, then by newest first.
