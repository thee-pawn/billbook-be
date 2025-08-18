const express = require('express');
const request = require('supertest');
const path = require('path');

// Mock environment
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

// Create test app
const app = express();
app.use(express.json());

// Add routes
const staffRoutes = require('./src/routes/staff');
app.use('/api/v1/staff', staffRoutes);

// Test staff validation
async function testStaffValidation() {
  console.log('Testing staff validation...');
  
  const testData = {
    name: "John Smith",
    contact: "9876543210",
    gender: "male",
    email: "john.smith@example.com",
    doj: "2025-06-27",
    dob: "1996-02-18",
    designation: "Senior Stylist",
    role: "employee",
    shifts: {
      workingDays: ["monday", "tuesday", "wednesday", "thursday", "friday"],
      workingHoursStart: "09:00",
      workingHoursEnd: "18:00"
    },
    documentId: "staff_doc_abc123.pdf",
    photoId: "staff_photo_abc123.jpg",
    salary: {
      earnings: {
        basic: 1234.90,
        hra: 400.00,
        otherAllowances: 300.00
      },
      deductions: {
        professionalTax: 30.00,
        epf: 12.00
      }
    },
    commission: {
      commissionType: "percentage",
      commissionCycle: "monthly",
      commissionRates: [
        {
          type: "products",
          commissionType: "percentage",
          minRevenue: 8000,
          maxRevenue: 12000,
          commission: 5
        }
      ]
    }
  };

  const response = await request(app)
    .post('/api/v1/staff/550e8400-e29b-41d4-a716-446655440000')
    .set('Authorization', 'Bearer fake-token')
    .send(testData);

  console.log('Response status:', response.status);
  console.log('Response body:', response.body);
}

// Run test
testStaffValidation().catch(console.error);
