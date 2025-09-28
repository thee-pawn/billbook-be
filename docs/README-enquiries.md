# Enquiries Module

This module manages store-scoped enquiries/leads with details, linking to existing customers by phone when available.

Base path: `/api/v1/enquiries`

Security: Bearer JWT required. Access is authorized per store via `store_users`.

## Entities
- enquiries: lead header with contact, source, type, status, notes, follow up, soft delete
- enquiry_details: line items referencing service/product/membership-package

## Key Enums
- gender: `male | female | other`
- source: `walk-in | instagram | facebook | cold-calling | website | client-reference`
- enquiry_type: `hot | cold | warm`
- enquiry_status: `pending | converted | closed`
- detail.category: `service | product | membership-package`

## cURL Examples

Create:
```bash
curl -X POST "http://localhost:3000/api/v1/enquiries/${STORE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{
  "contact_no": "9110178227",
  "country_code": "+91",
  "name": "Pawan Kumar",
  "gender": "male",
  "email": "pawan@example.com",
  "source": "instagram",
  "enquiry_type": "hot",
  "enquiry_status": "pending",
  "notes": "Prefers morning calls",
  "follow_up_at": "2025-09-20T05:00:00.000Z",
  "enquiry_details": [
    { "category": "service", "name": "Haircut", "reference_id": "svc-uuid-1" },
    { "category": "product", "name": "Shampoo", "reference_id": "prd-uuid-2" }
  ]
}'
```

List with filters:
```bash
curl -G "http://localhost:3000/api/v1/enquiries/${STORE_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  --data-urlencode "q=Pawan" \
  --data-urlencode "status=pending" \
  --data-urlencode "type=hot" \
  --data-urlencode "source=instagram" \
  --data-urlencode "from=2025-09-01T00:00:00.000Z" \
  --data-urlencode "to=2025-09-30T23:59:59.999Z"
```

Get by id:
```bash
curl -X GET "http://localhost:3000/api/v1/enquiries/${STORE_ID}/${ENQUIRY_ID}" -H "Authorization: Bearer ${TOKEN}"
```

Update (replace details):
```bash
curl -X PUT "http://localhost:3000/api/v1/enquiries/${STORE_ID}/${ENQUIRY_ID}" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{
  "enquiry_status": "pending",
  "enquiry_details": [
    { "category": "service", "name": "Hair Color", "reference_id": "svc-uuid-9" }
  ]
}'
```

Patch status:
```bash
curl -X PATCH "http://localhost:3000/api/v1/enquiries/${STORE_ID}/${ENQUIRY_ID}/status" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{ "enquiry_status": "converted" }'
```

Patch follow-up:
```bash
curl -X PATCH "http://localhost:3000/api/v1/enquiries/${STORE_ID}/${ENQUIRY_ID}/follow-up" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{ "follow_up_at": "2025-09-21T10:00:00.000Z" }'
```

Soft delete:
```bash
curl -X DELETE "http://localhost:3000/api/v1/enquiries/${STORE_ID}/${ENQUIRY_ID}" -H "Authorization: Bearer ${TOKEN}"
```

## Validation
Joi validators in `src/utils/enquiryValidation.js` enforce shapes and enums. Transactions ensure header + details atomicity.

## OpenAPI
See `docs/openapi/enquiries.yaml`.
