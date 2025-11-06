const Joi = require('joi');

const validate = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      // Log validation failure with request context
      try {
        console.warn('[VALIDATION][BODY]', {
          method: req.method,
          url: req.originalUrl,
          message: errorMessage
        });
      } catch (_) {}
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: errorMessage
      });
    }
    
    next();
  };
};

// Variant that allows unknown keys in the request body (useful for update endpoints
// where frontend may include extra fields like `billId`). This keeps strict
// validation for most endpoints while allowing controlled relaxation where needed.
const validateAllowUnknown = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.body, { allowUnknown: true });

    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      try {
        console.warn('[VALIDATION][BODY]', {
          method: req.method,
          url: req.originalUrl,
          message: errorMessage
        });
      } catch (_) {}
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        details: errorMessage
      });
    }

    next();
  };
};

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      try {
        console.warn('[VALIDATION][QUERY]', {
          method: req.method,
          url: req.originalUrl,
          message: errorMessage
        });
      } catch (_) {}
      return res.status(400).json({
        success: false,
        message: 'Query validation error',
        details: errorMessage
      });
    }
    
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    
    if (error) {
      const errorMessage = error.details.map(detail => detail.message).join(', ');
      try {
        console.warn('[VALIDATION][PARAMS]', {
          method: req.method,
          url: req.originalUrl,
          message: errorMessage
        });
      } catch (_) {}
      return res.status(400).json({
        success: false,
        message: 'Parameter validation error',
        details: errorMessage
      });
    }
    
    next();
  };
};

// Common validation schemas
const schemas = {
  // User registration schema
  userRegistration: Joi.object({
    name: Joi.string().min(2).max(100).required(),
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    email: Joi.string().email().required()
  }),

  // Login schema (phone-based)
  userLogin: Joi.object({
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    password: Joi.string().min(6).required()
  }),

  // OTP verification schema
  otpVerification: Joi.object({
    phoneNumber: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required(),
    otp: Joi.string().length(6).pattern(/^\d{6}$/).required()
  }),

  // Resend OTP schema
  resendOtp: Joi.object({
    userId: Joi.string().uuid().required(),
    attempts: Joi.number().integer().min(1).max(5).required()
  }),

  // Set password schema
  setPassword: Joi.object({
    userId: Joi.string().uuid().required(),
    password: Joi.string().min(6).required()
  }),

  // Enable MFA schema
  enableMfa: Joi.object({
    userId: Joi.string().uuid().required()
  }),

  // Forgot password schema
  forgotPassword: Joi.object({
    phone: Joi.string().pattern(/^\+?[1-9]\d{1,14}$/).required()
  }),

  // Reset password schema
  resetPassword: Joi.object({
    userId: Joi.string().uuid().required(),
    oldPassword: Joi.string().min(6).required(),
    password: Joi.string().min(6).required()
  }),

  // Store creation validation
  createStore: Joi.object({
    name: Joi.string().min(1).max(255).required(),
    mobile_no: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20).optional(),
    whatsapp_no: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20).optional(),
    contact_email_id: Joi.string().email().max(255).optional(),
    reporting_email_id: Joi.string().email().max(255).optional(),
    gst_number: Joi.string().max(50).optional(),
    tax_billing: Joi.string().max(100).optional(),
    business_category: Joi.string().max(100).optional(),
    instagram_link: Joi.string().uri().max(500).optional(),
    facebook_link: Joi.string().uri().max(500).optional(),
    google_maps_link: Joi.string().uri().max(500).optional(),
    address_line_1: Joi.string().max(1000).optional(),
    locality: Joi.string().max(255).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional(),
    pincode: Joi.string().max(20).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    logo_url: Joi.string().uri().max(500).optional()
  }),

  // Store update validation (all fields optional)
  updateStore: Joi.object({
    name: Joi.string().min(1).max(255).optional(),
    mobile_no: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20).optional(),
    whatsapp_no: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20).optional(),
    contact_email_id: Joi.string().email().max(255).optional(),
    reporting_email_id: Joi.string().email().max(255).optional(),
    gst_number: Joi.string().max(50).optional(),
    tax_billing: Joi.string().max(100).optional(),
    business_category: Joi.string().max(100).optional(),
    instagram_link: Joi.string().uri().max(500).optional(),
    facebook_link: Joi.string().uri().max(500).optional(),
    google_maps_link: Joi.string().uri().max(500).optional(),
    address_line_1: Joi.string().max(1000).optional(),
    locality: Joi.string().max(255).optional(),
    city: Joi.string().max(100).optional(),
    state: Joi.string().max(100).optional(),
    country: Joi.string().max(100).optional(),
    pincode: Joi.string().max(20).optional(),
    latitude: Joi.number().min(-90).max(90).optional(),
    longitude: Joi.number().min(-180).max(180).optional(),
    logo_url: Joi.string().uri().max(500).optional()
  }).min(1), // At least one field must be provided

  // Store user management validation
  addUserToStore: Joi.object({
    user_id: Joi.string().uuid().required(),
    role: Joi.string().valid('owner', 'manager', 'employee', 'member').required()
  }),

  updateUserRole: Joi.object({
    role: Joi.string().valid('owner', 'manager', 'employee', 'member').required()
  }),

  // Shift validation schemas
  createShift: Joi.object({
    day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
    opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    is_24_hrs_open: Joi.boolean().default(false),
    is_closed: Joi.boolean().default(false)
  }),

  // Bulk shifts creation schema - array of shift objects
  createBulkShifts: Joi.object({
    shifts: Joi.array().items(
      Joi.object({
        day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
        opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        is_24_hrs_open: Joi.boolean().default(false),
        is_closed: Joi.boolean().default(false)
      })
    ).min(1).max(7).required().unique((a, b) => a.day === b.day)
  }),

  updateShift: Joi.object({
    day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').optional(),
    opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    is_24_hrs_open: Joi.boolean().optional(),
    is_closed: Joi.boolean().optional()
  }).min(1),

  // Bulk shifts update schema - array of shift objects with IDs
  updateBulkShifts: Joi.object({
    shifts: Joi.array().items(
      Joi.object({
        id: Joi.string().uuid().required(),
        day: Joi.string().valid('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday').required(),
        opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        is_24_hrs_open: Joi.boolean().default(false),
        is_closed: Joi.boolean().default(false)
      })
    ).min(1).max(7).required().unique((a, b) => a.day === b.day)
  }),

  // Special shift validation schemas
  createSpecialShift: Joi.object({
    date: Joi.date().iso().required(),
    name: Joi.string().max(255).optional().allow(null, ''),
    opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    is_24_hours_open: Joi.boolean().default(false),
    is_closed: Joi.boolean().default(false)
  }),

  updateSpecialShift: Joi.object({
    date: Joi.date().iso().optional(),
    name: Joi.string().max(255).optional().allow(null, ''),
    opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
    is_24_hours_open: Joi.boolean().optional(),
    is_closed: Joi.boolean().optional()
  }).min(1),

  createBulkSpecialShifts: Joi.object({
    special_shifts: Joi.array().items(
      Joi.object({
        date: Joi.date().iso().required(),
        name: Joi.string().max(255).optional().allow(null, ''),
        opening_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        closing_time: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional().allow(null),
        is_24_hours_open: Joi.boolean().default(false),
        is_closed: Joi.boolean().default(false)
      })
    ).min(1).max(50).required().custom((value, helpers) => {
      // Check for duplicate dates
      const dates = value.map(shift => shift.date.toISOString().split('T')[0]);
      const uniqueDates = [...new Set(dates)];
      if (dates.length !== uniqueDates.length) {
        return helpers.error('array.unique', { 
          message: 'Duplicate dates are not allowed in special shifts array' 
        });
      }
      return value;
    }, 'unique dates validation')
  }),

  // Receipt settings validation schemas
  createReceiptSettings: Joi.object({
    logo: Joi.boolean().default(false),
    gst_no: Joi.boolean().default(false),
    staff_name: Joi.boolean().default(false),
    loyalty_points: Joi.boolean().default(false),
    wallet_balance: Joi.boolean().default(false),
    payment_method: Joi.boolean().default(false),
    date_time: Joi.boolean().default(false),
    customer_contact: Joi.boolean().default(false),
    discount: Joi.boolean().default(false),
    notes: Joi.array().items(Joi.string().max(500)).max(10).optional().allow(null),
    phone_numbers: Joi.string().pattern(/^[\d,\s+-]*$/).max(1000).optional().allow('')
  }),

  updateReceiptSettings: Joi.object({
    logo: Joi.boolean().optional(),
    gst_no: Joi.boolean().optional(),
    staff_name: Joi.boolean().optional(),
    loyalty_points: Joi.boolean().optional(),
    wallet_balance: Joi.boolean().optional(),
    payment_method: Joi.boolean().optional(),
    date_time: Joi.boolean().optional(),
    customer_contact: Joi.boolean().optional(),
    discount: Joi.boolean().optional(),
    notes: Joi.array().items(Joi.string().max(500)).max(10).optional().allow(null),
    phone_numbers: Joi.string().pattern(/^[\d,\s+-]*$/).max(1000).optional().allow('')
  }).min(1),

  // ID parameter validation
  idParam: Joi.object({
    id: Joi.string().uuid().required()
  }),

  // Pagination query validation
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    sortBy: Joi.string().optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Product validation schemas
  createProduct: Joi.object({
    name: Joi.string().max(255).required(),
    company: Joi.string().max(255).optional().allow(''),
    cost_price: Joi.number().precision(2).min(0).optional().allow(null),
    selling_price: Joi.number().precision(2).min(0).optional().allow(null),
    usage: Joi.string().max(255).optional().allow(''),
    category: Joi.string().max(100).optional().allow(''),
    qty: Joi.number().integer().min(0).default(0),
    prod_qty: Joi.number().integer().min(0).optional().allow(null),
    prod_qty_unit: Joi.string().max(50).optional().allow(''),
    mfg_date: Joi.date().optional().allow(null),
    exp_date: Joi.date().optional().allow(null),
    notification_qty: Joi.number().integer().min(1).optional().default(null),
    expiry_notification_days: Joi.number().integer().min(1).optional().default(null),
    hsn_sac_code: Joi.string().max(20).optional().allow(''),
    tax_prcnt: Joi.number().precision(2).min(0).max(100).optional().allow(null),
    description: Joi.string().optional().allow(''),
    batch_no: Joi.string().max(100).optional().allow('')
  }),

  updateProduct: Joi.object({
    name: Joi.string().max(255).optional(),
    company: Joi.string().max(255).optional().allow(''),
    cost_price: Joi.number().precision(2).min(0).optional().allow(null),
    selling_price: Joi.number().precision(2).min(0).optional().allow(null),
    usage: Joi.string().max(255).optional().allow(''),
    category: Joi.string().max(100).optional().allow(''),
    qty: Joi.number().integer().min(0).optional(),
    prod_qty: Joi.number().integer().min(0).optional().allow(null),
    prod_qty_unit: Joi.string().max(50).optional().allow(''),
    mfg_date: Joi.date().optional().allow(null),
    exp_date: Joi.date().optional().allow(null),
    notification_qty: Joi.number().integer().min(0).optional(),
    expiry_notification_days: Joi.number().integer().min(0).optional(),
    hsn_sac_code: Joi.string().max(20).optional().allow(''),
    tax_prcnt: Joi.number().precision(2).min(0).max(100).optional().allow(null),
    description: Joi.string().optional().allow(''),
    batch_no: Joi.string().max(100).optional().allow('')
  }).min(1),

  // Product query validation
  productQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().optional(),
    category: Joi.string().optional(),
    company: Joi.string().optional(),
    batch_no: Joi.string().optional(),
    low_stock: Joi.boolean().optional(),
    expiring_soon: Joi.boolean().optional(),
    sortBy: Joi.string().valid('name', 'category', 'company', 'exp_date', 'qty', 'created_at').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Quantity update validation
  quantityUpdate: Joi.object({
    quantity: Joi.number().integer().min(1).required()
  }),

  // Service validation schemas
  createService: Joi.object({
    name: Joi.string().max(255).required(),
    reminder: Joi.number().integer().min(0).optional().allow(null),
    category: Joi.string().max(100).optional().allow(''),
    description: Joi.string().optional().allow(''),
    gender: Joi.string().max(20).optional().allow(''),
    price: Joi.number().precision(2).min(0).optional().allow(null),
    duration: Joi.number().integer().min(0).optional().allow(null),
    tax_prcnt: Joi.number().precision(2).min(0).max(100).optional().allow(null),
    status: Joi.string().valid('active', 'inactive').default('active'),
    productUsage: Joi.array().items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        qty: Joi.number().integer().min(1).required(),
        unit: Joi.string().max(50).optional().allow('')
      })
    ).optional().default([])
  }),

  updateService: Joi.object({
    name: Joi.string().max(255).optional(),
    reminder: Joi.number().integer().min(0).optional().allow(null),
    category: Joi.string().max(100).optional().allow(''),
    description: Joi.string().optional().allow(''),
    gender: Joi.string().max(20).optional().allow(''),
    price: Joi.number().precision(2).min(0).optional().allow(null),
    duration: Joi.number().integer().min(0).optional().allow(null),
    tax_prcnt: Joi.number().precision(2).min(0).max(100).optional().allow(null),
    status: Joi.string().valid('active', 'inactive').optional(),
    productUsage: Joi.array().items(
      Joi.object({
        productId: Joi.string().uuid().required(),
        qty: Joi.number().integer().min(1).required(),
        unit: Joi.string().max(50).optional().allow('')
      })
    ).optional()
  }).min(1),

  // Service query validation
  serviceQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().optional(),
    category: Joi.string().optional(),
    gender: Joi.string().optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
    sortBy: Joi.string().valid('name', 'category', 'gender', 'price', 'duration', 'status', 'created_at').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Membership validation schemas
  createMembership: Joi.object({
    name: Joi.string().max(255).required(),
    description: Joi.string().optional().allow(''),
    price: Joi.number().precision(2).min(0).required(),
    walletBalance: Joi.number().precision(2).min(0).default(0),
    validity: Joi.object({
      years: Joi.number().integer().min(0).default(0),
      months: Joi.number().integer().min(0).default(0),
      days: Joi.number().integer().min(0).default(0)
    }).required(),
    overallDiscount: Joi.object({
      type: Joi.string().valid('percentage', 'fixed').required(),
      value: Joi.number().precision(2).min(0).required()
    }).optional(),
    serviceDiscount: Joi.object({
      type: Joi.string().valid('percentage', 'fixed').required(),
      value: Joi.number().precision(2).min(0).required(),
      includedServices: Joi.array().items(Joi.string().uuid()).optional().default([]),
      includeAllServices: Joi.boolean().default(false),
      excludedServices: Joi.array().items(Joi.string().uuid()).optional().default([])
    }).optional(),
    productDiscount: Joi.object({
      type: Joi.string().valid('percentage', 'fixed').required(),
      value: Joi.number().precision(2).min(0).required(),
      includedProducts: Joi.array().items(Joi.string().uuid()).optional().default([]),
      includeAllProducts: Joi.boolean().default(false),
      excludedProducts: Joi.array().items(Joi.string().uuid()).optional().default([])
    }).optional(),
    servicePackage: Joi.object({
      servicePackageId: Joi.string().uuid().optional().allow(null),
      services: Joi.array().items(
        Joi.object({
          serviceId: Joi.string().uuid().required(),
          quantityType: Joi.string().valid('sessions', 'hours', 'minutes').required(),
          quantityValue: Joi.number().integer().min(1).required()
        })
      ).optional().default([])
    }).optional(),
    loyaltyPoints: Joi.object({
      oneTimeBonus: Joi.number().integer().min(0).default(0),
      servicePointsMultiplier: Joi.number().precision(2).min(0).default(1.0),
      productPointsMultiplier: Joi.number().precision(2).min(0).default(1.0),
      membershipPointsMultiplier: Joi.number().precision(2).min(0).default(1.0)
    }).optional(),
    status: Joi.string().valid('active', 'inactive').default('active')
  }),

  updateMembership: Joi.object({
    name: Joi.string().max(255).optional(),
    description: Joi.string().optional().allow(''),
    price: Joi.number().precision(2).min(0).optional(),
    walletBalance: Joi.number().precision(2).min(0).optional(),
    validity: Joi.object({
      years: Joi.number().integer().min(0).optional(),
      months: Joi.number().integer().min(0).optional(),
      days: Joi.number().integer().min(0).optional()
    }).optional(),
    overallDiscount: Joi.object({
      type: Joi.string().valid('percentage', 'fixed').required(),
      value: Joi.number().precision(2).min(0).required()
    }).optional(),
    serviceDiscount: Joi.object({
      type: Joi.string().valid('percentage', 'fixed').required(),
      value: Joi.number().precision(2).min(0).required(),
      includedServices: Joi.array().items(Joi.string().uuid()).optional(),
      includeAllServices: Joi.boolean().optional(),
      excludedServices: Joi.array().items(Joi.string().uuid()).optional()
    }).optional(),
    productDiscount: Joi.object({
      type: Joi.string().valid('percentage', 'fixed').required(),
      value: Joi.number().precision(2).min(0).required(),
      includedProducts: Joi.array().items(Joi.string().uuid()).optional(),
      includeAllProducts: Joi.boolean().optional(),
      excludedProducts: Joi.array().items(Joi.string().uuid()).optional()
    }).optional(),
    servicePackage: Joi.object({
      servicePackageId: Joi.string().uuid().optional().allow(null),
      services: Joi.array().items(
        Joi.object({
          serviceId: Joi.string().uuid().required(),
          quantityType: Joi.string().valid('sessions', 'hours', 'minutes').required(),
          quantityValue: Joi.number().integer().min(1).required()
        })
      ).optional()
    }).optional(),
    loyaltyPoints: Joi.object({
      oneTimeBonus: Joi.number().integer().min(0).optional(),
      servicePointsMultiplier: Joi.number().precision(2).min(0).optional(),
      productPointsMultiplier: Joi.number().precision(2).min(0).optional(),
      membershipPointsMultiplier: Joi.number().precision(2).min(0).optional()
    }).optional(),
    status: Joi.string().valid('active', 'inactive').optional()
  }).min(1),

  // Membership query validation
  membershipQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
    min_price: Joi.number().precision(2).min(0).optional(),
    max_price: Joi.number().precision(2).min(0).optional(),
    sortBy: Joi.string().valid('name', 'price', 'created_at', 'status').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Service Package validation schemas
  createServicePackage: Joi.object({
    packageName: Joi.string().max(255).required(),
    description: Joi.string().optional().allow(''),
    price: Joi.number().precision(2).min(0).required(),
    validity: Joi.object({
      years: Joi.number().integer().min(0).default(0),
      months: Joi.number().integer().min(0).default(0),
      days: Joi.number().integer().min(0).default(0)
    }).required(),
    services: Joi.array().items(
      Joi.object({
        serviceId: Joi.string().uuid().required(),
        quantityType: Joi.string().valid('Hours', 'Minutes', 'serviceCount', 'sessions').required(),
        qty: Joi.number().integer().min(1).required(),
        type: Joi.string().valid('included', 'discount').required(),
        discountValue: Joi.number().precision(2).min(0).when('type', {
          is: 'discount',
          then: Joi.required(),
          otherwise: Joi.optional().default(0)
        })
      })
    ).min(1).required(),
    status: Joi.string().valid('active', 'inactive').default('active')
  }),

  updateServicePackage: Joi.object({
    packageName: Joi.string().max(255).optional(),
    description: Joi.string().optional().allow(''),
    price: Joi.number().precision(2).min(0).optional(),
    validity: Joi.object({
      years: Joi.number().integer().min(0).optional(),
      months: Joi.number().integer().min(0).optional(),
      days: Joi.number().integer().min(0).optional()
    }).optional(),
    services: Joi.array().items(
      Joi.object({
        serviceId: Joi.string().uuid().required(),
        quantityType: Joi.string().valid('Hours', 'Minutes', 'serviceCount', 'sessions').required(),
        qty: Joi.number().integer().min(1).required(),
        type: Joi.string().valid('included', 'discount').required(),
        discountValue: Joi.number().precision(2).min(0).when('type', {
          is: 'discount',
          then: Joi.required(),
          otherwise: Joi.optional().default(0)
        })
      })
    ).optional(),
    status: Joi.string().valid('active', 'inactive').optional()
  }).min(1),

  // Service Package query validation
  servicePackageQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().optional(),
    status: Joi.string().valid('active', 'inactive').optional(),
    min_price: Joi.number().precision(2).min(0).optional(),
    max_price: Joi.number().precision(2).min(0).optional(),
    sortBy: Joi.string().valid('packageName', 'price', 'created_at', 'status').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Loyalty Points Configuration validation
  createLoyaltyPointsConfiguration: Joi.object({
    loyaltyPointsConversionRate: Joi.number().integer().min(1).required(),
    serviceLoyaltyPoints: Joi.number().integer().min(0).required(),
    productLoyaltyPoints: Joi.number().integer().min(0).required(),
  membershipLoyaltyPoints: Joi.number().integer().min(0).required(),
  minServiceRedemption: Joi.number().integer().min(0).default(0),
  maxServiceRedemption: Joi.number().integer().min(0).default(0),
  minProductsRedemption: Joi.number().integer().min(0).default(0),
  maxProductsRedemption: Joi.number().integer().min(0).default(0),
  minMembershipRedemption: Joi.number().integer().min(0).default(0),
  maxMembershipRedemption: Joi.number().integer().min(0).default(0)
  }),

  updateLoyaltyPointsConfiguration: Joi.object({
    loyaltyPointsConversionRate: Joi.number().integer().min(1).optional(),
    serviceLoyaltyPoints: Joi.number().integer().min(0).optional(),
    productLoyaltyPoints: Joi.number().integer().min(0).optional(),
  membershipLoyaltyPoints: Joi.number().integer().min(0).optional(),
  minServiceRedemption: Joi.number().integer().min(0).optional(),
  maxServiceRedemption: Joi.number().integer().min(0).optional(),
  minProductsRedemption: Joi.number().integer().min(0).optional(),
  maxProductsRedemption: Joi.number().integer().min(0).optional(),
  minMembershipRedemption: Joi.number().integer().min(0).optional(),
  maxMembershipRedemption: Joi.number().integer().min(0).optional()
  }),

  // Coupon validation schemas
  createCoupon: Joi.object({
    couponCode: Joi.string().trim().min(1).max(100).required(),
    description: Joi.string().trim().max(500).optional(),
    validForm: Joi.date().iso().required(),
    validTill: Joi.date().iso().min(Joi.ref('validForm')).required(),
    discount: Joi.object({
      type: Joi.string().valid('fixed', 'percentage').required(),
      value: Joi.number().precision(2).min(0).when('type', {
        is: 'percentage',
        then: Joi.number().max(100),
        otherwise: Joi.number().max(999999.99)
      }).required()
    }).required(),
    conditions: Joi.object({
      minimumSpend: Joi.number().precision(2).min(0).default(0),
      maximumDisc: Joi.number().precision(2).min(0).optional(),
      limit: Joi.number().integer().min(1).default(1),
      limitRefereshDays: Joi.number().integer().min(1).default(30)
    }).optional(),
    includedServices: Joi.object({
      allIncluded: Joi.boolean().default(false),
  inclusions: Joi.array().items(Joi.string().uuid()).optional().default([])
    }).optional(),
    includedProducts: Joi.object({
  allIncluded: Joi.boolean().default(false),
  inclusions: Joi.array().items(Joi.string().uuid()).optional().default([])
    }).optional(),
    includedMemberships: Joi.object({
  allIncluded: Joi.boolean().default(false),
  inclusions: Joi.array().items(Joi.string().uuid()).optional().default([])
    }).optional(),
    status: Joi.string().valid('active', 'inactive').default('active')
  }),

  updateCoupon: Joi.object({
    couponCode: Joi.string().trim().min(1).max(100).optional(),
    description: Joi.string().trim().max(500).optional(),
    validForm: Joi.date().iso().optional(),
    validTill: Joi.date().iso().min(Joi.ref('validForm')).optional(),
    discount: Joi.object({
      type: Joi.string().valid('fixed', 'percentage').required(),
      value: Joi.number().precision(2).min(0).when('type', {
        is: 'percentage',
        then: Joi.number().max(100),
        otherwise: Joi.number().max(999999.99)
      }).required()
    }).optional(),
    conditions: Joi.object({
      minimumSpend: Joi.number().precision(2).min(0).optional(),
      maximumDisc: Joi.number().precision(2).min(0).optional(),
      limit: Joi.number().integer().min(1).optional(),
      limitRefereshDays: Joi.number().integer().min(1).optional()
    }).optional(),
    includedServices: Joi.object({
  allIncluded: Joi.boolean().required(),
  inclusions: Joi.array().items(Joi.string().uuid()).optional()
    }).optional(),
    includedProducts: Joi.object({
  allIncluded: Joi.boolean().required(),
  inclusions: Joi.array().items(Joi.string().uuid()).optional()
    }).optional(),
    includedMemberships: Joi.object({
  allIncluded: Joi.boolean().required(),
  inclusions: Joi.array().items(Joi.string().uuid()).optional()
    }).optional(),
    status: Joi.string().valid('active', 'inactive', 'expired').optional()
  }),

  // Coupon query validation
  couponQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().optional(),
    status: Joi.string().valid('active', 'inactive', 'expired').optional(),
    sortBy: Joi.string().valid('couponCode', 'validFrom', 'validTill', 'discountValue', 'created_at').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Eligible coupons query validation
  eligibleCouponsQuery: Joi.object({
    customerId: Joi.string().uuid().optional(),
    phoneNumber: Joi.string().trim().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    orderAmount: Joi.number().precision(2).min(0).optional(),
    date: Joi.date().iso().optional(),
    serviceIds: Joi.array().items(Joi.string().uuid()).default([]).optional(),
    productIds: Joi.array().items(Joi.string().uuid()).default([]).optional(),
    membershipIds: Joi.array().items(Joi.string().uuid()).default([]).optional()
  }),

  // Coupon validation (for applying coupon)
  validateCoupon: Joi.object({
    couponCode: Joi.string().trim().min(1).max(100).required(),
    orderAmount: Joi.number().precision(2).min(0).required(),
    serviceIds: Joi.array().items(Joi.string().uuid()).optional(),
    productIds: Joi.array().items(Joi.string().uuid()).optional(),
    membershipIds: Joi.array().items(Joi.string().uuid()).optional()
  }),

  // Customer notes validation
  createCustomerNote: Joi.object({
    note: Joi.string().trim().min(1).max(5000).required(),
    starred: Joi.boolean().default(false)
  }),
  updateCustomerNote: Joi.object({
    note: Joi.string().trim().min(1).max(5000).optional(),
    starred: Joi.boolean().optional()
  }),

  // Customer validation schemas
  createCustomer: Joi.object({
    phoneNumber: Joi.string().trim().pattern(/^\+?[1-9]\d{1,14}$/).required(), // E.164 format
    name: Joi.string().trim().max(255).optional().allow(''),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional().allow(''),
    birthday: Joi.string().pattern(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/).optional().allow(''), // DD/MM format
    anniversary: Joi.string().pattern(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/).optional().allow(''), // DD/MM format
    address: Joi.string().trim().max(1000).optional().allow('')
  }),

  updateCustomer: Joi.object({
    phoneNumber: Joi.string().trim().pattern(/^\+?[1-9]\d{1,14}$/).optional(),
    name: Joi.string().trim().max(255).optional().allow(''),
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional().allow(''),
    birthday: Joi.string().pattern(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/).optional().allow(''),
    anniversary: Joi.string().pattern(/^(0[1-9]|[12][0-9]|3[01])\/(0[1-9]|1[0-2])$/).optional().allow(''),
    address: Joi.string().trim().max(1000).optional().allow(''),
    status: Joi.string().valid('active', 'inactive', 'blocked').optional()
  }),

  // Customer query validation
  customerQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    search: Joi.string().optional(), // Search by name or phone
    gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say').optional(),
    status: Joi.string().valid('active', 'inactive', 'blocked').optional(),
    hasLoyaltyPoints: Joi.boolean().optional(),
    hasDues: Joi.boolean().optional(),
    hasWalletBalance: Joi.boolean().optional(),
    sortBy: Joi.string().valid('name', 'phoneNumber', 'loyaltyPoints', 'walletBalance', 'lastVisit', 'created_at').optional(),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Customer wallet/loyalty adjustment validation
  customerAdjustment: Joi.object({
    type: Joi.string().valid('loyalty_points', 'wallet_balance', 'dues', 'advance_amount').required(),
    amount: Joi.number().precision(2).required(),
    description: Joi.string().trim().max(500).optional(),
    operation: Joi.string().valid('add', 'subtract', 'set').default('add')
  }),

  // Customer membership purchase validation
  purchaseMembership: Joi.object({
    membershipId: Joi.string().uuid().required(),
    validFrom: Joi.date().iso().default(() => new Date()),
    validTill: Joi.date().iso().required()
  }),

  // Customer service package purchase validation
  purchaseServicePackage: Joi.object({
    servicePackageId: Joi.string().uuid().required(),
    validFrom: Joi.date().iso().default(() => new Date()),
    validTill: Joi.date().iso().required()
  }),

  // Review validation schemas
  createReview: Joi.object({
    storeId: Joi.string().uuid().required(),
    referringId: Joi.string().trim().min(1).max(255).required(),
    staffRating: Joi.number().integer().min(1).max(5).required(),
    hospitalityRating: Joi.number().integer().min(1).max(5).required(),
    serviceRating: Joi.number().integer().min(1).max(5).required(),
    review: Joi.string().trim().max(2000).allow('').default(''),
    name: Joi.string().trim().min(1).max(255).optional()
  }),

  reviewQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    status: Joi.string().valid('active', 'inactive', 'pending', 'rejected').optional(),
    minRating: Joi.number().integer().min(1).max(5).optional(),
    maxRating: Joi.number().integer().min(1).max(5).optional(),
    sortBy: Joi.string().valid('created_at', 'staff_rating', 'hospitality_rating', 'service_rating').default('created_at'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  // Expense validation schemas
  createExpense: Joi.object({
    expenseName: Joi.string().trim().min(1).max(255).required(),
    date: Joi.date().iso().required(),
    employee_id: Joi.string().uuid().required(),
    category: Joi.string().trim().min(1).max(100).required(),
    amount: Joi.number().precision(2).min(0).required(),
    paymentMethod: Joi.string().trim().min(1).max(50).required(),
    description: Joi.string().trim().max(1000).allow('').default(''),
  receipt_id: Joi.string().trim().max(255).allow('', null).default('')
  }),

  updateExpense: Joi.object({
    expenseName: Joi.string().trim().min(1).max(255).optional(),
    date: Joi.date().iso().optional(),
    employee_id: Joi.string().uuid().optional(),
    category: Joi.string().trim().min(1).max(100).optional(),
    amount: Joi.number().precision(2).min(0).optional(),
    paymentMethod: Joi.string().trim().min(1).max(50).optional(),
    description: Joi.string().trim().max(1000).allow('').optional(),
  receipt_id: Joi.string().trim().max(255).allow('', null).optional()
  }),

  expenseQuery: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(10),
    employee_id: Joi.string().uuid().optional(),
    category: Joi.string().trim().optional(),
    status: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    minAmount: Joi.number().min(0).optional(),
    maxAmount: Joi.number().min(0).optional(),
    paymentMethod: Joi.string().trim().optional(),
    sortBy: Joi.string().valid('date', 'amount', 'expense_name', 'category', 'created_at').default('date'),
    sortOrder: Joi.string().valid('asc', 'desc').default('desc')
  }),

  approveExpense: Joi.object({
    status: Joi.string().valid('approved', 'rejected').required(),
    comments: Joi.string().trim().max(500).allow('').default('')
  })
};

module.exports = {
  validate,
  validateQuery,
  validateParams,
  validateAllowUnknown,
  schemas
};
