const { 
    createStaffSchema, 
    storeIdSchema 
} = require('./src/utils/staffValidation');

// Test data
const testStoreId = { storeId: "550e8400-e29b-41d4-a716-446655440000" };
const testStaffData = {
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

console.log('Testing store ID validation...');
const storeResult = storeIdSchema.validate(testStoreId);
if (storeResult.error) {
    console.log('Store ID validation error:', storeResult.error.details);
} else {
    console.log('Store ID validation passed ✓');
}

console.log('\nTesting staff data validation...');
const staffResult = createStaffSchema.validate(testStaffData);
if (staffResult.error) {
    console.log('Staff data validation error:', staffResult.error.details);
} else {
    console.log('Staff data validation passed ✓');
}
