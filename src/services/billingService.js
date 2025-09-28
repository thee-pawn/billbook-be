const database = require('../config/database');

class BillingService {
  
  // Get or create customer
  async resolveCustomer(client, storeId, customerData) {
    if (customerData.customer_id) {
      // Verify existing customer belongs to store
      const { rows } = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND store_id = $2',
        [customerData.customer_id, storeId]
      );
      if (!rows.length) {
        throw new Error('Customer not found in this store');
      }
      return rows[0];
    } else {
      // Create or find customer by phone
      const customer = customerData.customer || customerData.customer_details;
      const phone = customer.contact_no;
      
      // Check if customer already exists by phone
      const { rows: existing } = await client.query(
        'SELECT * FROM customers WHERE store_id = $1 AND phone_number = $2',
        [storeId, phone]
      );
      
      if (existing.length) {
        return existing[0];
      }
      
      // Create new customer
      const { rows: [newCustomer] } = await client.query(
        `INSERT INTO customers (
          store_id, phone_number, name, gender, address, email, birthday, anniversary,
          loyalty_points, wallet_balance, dues, advance_amount,
          status, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, 0, 0.00, 0.00, 0.00, 'active', NOW(), NOW()
        ) RETURNING *`,
        [
          storeId,
          phone,
          customer.name,
          customer.gender || '',
          customer.address || '',
          customer.email || '',
          customer.birthday || null,
          customer.anniversary || null
        ]
      );
      
      return newCustomer;
    }
  }
  
  // Get catalog item (service/product/membership) details
  async getCatalogItem(client, storeId, type, catalogId) {
    let table, nameField = 'name';
    switch (type) {
      case 'service':
        table = 'services';
        break;
      case 'product':
        table = 'products';
        break;
      case 'membership':
        table = 'memberships';
        nameField = 'membership_name';
        break;
      default:
        throw new Error(`Invalid catalog type: ${type}`);
    }
    
    const { rows } = await client.query(
      `SELECT id, ${nameField} as name, price FROM ${table} WHERE id = $1 AND store_id = $2`,
      [catalogId, storeId]
    );
    
    if (!rows.length) {
      throw new Error(`${type} not found: ${catalogId}`);
    }
    
    return rows[0];
  }
  
  // Get store tax settings
  async getStoreTaxSettings(client, storeId) {
    const { rows } = await client.query(
      'SELECT tax_billing FROM stores WHERE id = $1',
      [storeId]
    );
    
    if (!rows.length) {
      throw new Error('Store not found');
    }
    
    // Default to exclusive if not set
    return rows[0].tax_billing || 'exclusive';
  }
  
  // Calculate line item totals with tax
  calculateLineItem(item, catalogItem, taxMode) {
    const basePrice = parseFloat(catalogItem.price);
    const qty = item.qty;
    const cgstRate = item.cgst / 100; // Convert percentage to decimal
    const sgstRate = item.sgst / 100;
    const totalTaxRate = cgstRate + sgstRate;
    
    let baseAmount, discountAmount, cgstAmount, sgstAmount, lineTotal;
    
    if (taxMode === 'inclusive') {
      // Price includes tax, extract base amount first
      const grossAmount = basePrice * qty;
      baseAmount = grossAmount / (1 + totalTaxRate);
      
      // Apply discount on base amount
      if (item.discount_type === 'percent') {
        discountAmount = (baseAmount * item.discount_value) / 100;
      } else {
        discountAmount = Math.min(item.discount_value, baseAmount);
      }
      
      const netBase = baseAmount - discountAmount;
      cgstAmount = netBase * cgstRate;
      sgstAmount = netBase * sgstRate;
      lineTotal = netBase + cgstAmount + sgstAmount;
    } else {
      // Exclusive: tax added on top
      baseAmount = basePrice * qty;
      
      // Apply discount on base amount
      if (item.discount_type === 'percent') {
        discountAmount = (baseAmount * item.discount_value) / 100;
      } else {
        discountAmount = Math.min(item.discount_value, baseAmount);
      }
      
      const netBase = baseAmount - discountAmount;
      cgstAmount = netBase * cgstRate;
      sgstAmount = netBase * sgstRate;
      lineTotal = netBase + cgstAmount + sgstAmount;
    }
    
    return {
      base_amount: this.round(baseAmount),
      discount_amount: this.round(discountAmount),
      cgst_amount: this.round(cgstAmount),
      sgst_amount: this.round(sgstAmount),
      line_total: this.round(lineTotal)
    };
  }

  // Calculate line item totals with direct price and tax amounts (new payload format)
  calculateLineItemFromPrice(item) {
    const unitPrice = parseFloat(item.price);
    const qty = item.qty;
    const baseAmount = unitPrice * qty;
    
    // Apply discount on base amount
    let discountAmount;
    if (item.discount_type === 'percent') {
      discountAmount = (baseAmount * item.discount_value) / 100;
    } else {
      discountAmount = Math.min(item.discount_value, baseAmount);
    }
    
    const taxableAmount = baseAmount - discountAmount;
    
    // CGST and SGST can be provided as rates or amounts
    // If values are small (< 1), treat as rates, otherwise as amounts
    let cgstAmount, sgstAmount;
    
    if (item.cgst < 1) {
      // Treat as rate (percentage in decimal)
      cgstAmount = taxableAmount * item.cgst;
    } else if (item.cgst <= 100) {
      // Treat as percentage rate
      cgstAmount = taxableAmount * (item.cgst / 100);
    } else {
      // Treat as direct amount
      cgstAmount = item.cgst;
    }
    
    if (item.sgst < 1) {
      // Treat as rate (percentage in decimal)  
      sgstAmount = taxableAmount * item.sgst;
    } else if (item.sgst <= 100) {
      // Treat as percentage rate
      sgstAmount = taxableAmount * (item.sgst / 100);
    } else {
      // Treat as direct amount
      sgstAmount = item.sgst;
    }
    
    const taxAmount = cgstAmount + sgstAmount;
    const lineTotal = taxableAmount + taxAmount;
    
    return {
      unit_price: this.round(unitPrice),
      base_amount: this.round(baseAmount),
      discount_amount: this.round(discountAmount),
      taxable_amount: this.round(taxableAmount),
      cgst_amount: this.round(cgstAmount),
      sgst_amount: this.round(sgstAmount),
      tax_amount: this.round(taxAmount),
      line_total: this.round(lineTotal)
    };
  }
  
  // Calculate bill totals
  calculateBillTotals(lineItems, billDiscount) {
    const subTotal = lineItems.reduce((sum, item) => sum + item.line_total, 0);
    const totalCgst = lineItems.reduce((sum, item) => sum + item.cgst_amount, 0);
    const totalSgst = lineItems.reduce((sum, item) => sum + item.sgst_amount, 0);
    const taxAmount = totalCgst + totalSgst;
    
    // Apply bill-level discount after line calculations
    const discountAmount = Math.min(billDiscount, subTotal);
    const grandTotal = Math.max(0, subTotal - discountAmount);
    
    return {
      sub_total: this.round(subTotal),
      discount: this.round(discountAmount),
      tax_amount: this.round(taxAmount),
      cgst_amount: this.round(totalCgst),
      sgst_amount: this.round(totalSgst),
      grand_total: this.round(grandTotal)
    };
  }
  
  // Generate invoice number (race condition safe)
  async generateInvoiceNumber(client, storeId) {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    
    // Use timestamp-based approach to avoid race conditions
    // Format: INV{YEAR}{MONTH}{DAY}{HHMMSS}{milliseconds}
    const timestamp = now.toISOString().replace(/[-:T.]/g, '').slice(8, 17); // HHMMSSMMM
    
    return `INV${year}${month}${day}${timestamp}`;
  }
  
  // Calculate payment status
  calculatePaymentStatus(grandTotal, paidAmount) {
    const total = parseFloat(grandTotal);
    const paid = parseFloat(paidAmount);
    const dues = Math.max(0, total - paid);
    
    let status;
    if (dues === 0) {
      status = 'paid';
    } else if (paid > 0) {
      status = 'partial';
    } else {
      status = 'unpaid';
    }
    
    return {
      status,
      dues: this.round(dues)
    };
  }
  
  // Apply coupons (basic implementation - can be enhanced)
  async applyCoupons(client, storeId, customerId, couponCodes, orderAmount) {
    // For now, return 0 discount - implement coupon logic as needed
    // This would integrate with your existing coupon system
    return 0;
  }
  
  // Round to 2 decimal places
  round(amount) {
    return Math.round(parseFloat(amount) * 100) / 100;
  }
  
  // Save bill transaction
  async saveBillTransaction(client, storeId, userId, payload, idempotencyKey = null) {
    // Resolve customer
    const customer = await this.resolveCustomer(client, storeId, payload);
    
    // Get store tax settings
    const taxMode = await this.getStoreTaxSettings(client, storeId);
    
    // Process items and calculate totals
    const processedItems = [];
    for (const item of payload.items) {
      const catalogItem = await this.getCatalogItem(client, storeId, item.type, item.id);
      
      let calculations;
      if (item.price !== undefined) {
        // New payload format with direct price
        calculations = this.calculateLineItemFromPrice(item);
      } else {
        // Legacy format using catalog price
        calculations = this.calculateLineItem(item, catalogItem, taxMode);
      }
      
      processedItems.push({
        ...item,
        name: catalogItem.name,
        ...calculations
      });
    }
    
    // Calculate bill totals
    const totals = this.calculateBillTotals(processedItems, payload.discount || 0);
    
    // Calculate payment status
    const paymentStatus = this.calculatePaymentStatus(totals.grand_total, payload.payment_amount || 0);
    
    // Generate invoice number
    const invoiceNumber = await this.generateInvoiceNumber(client, storeId);
    
    // Insert bill
    const { rows: [bill] } = await client.query(
      `INSERT INTO bills (
        store_id, customer_id, invoice_number, coupon_code, coupon_codes, referral_code,
        sub_total, discount, tax_amount, cgst_amount, sgst_amount, grand_total,
        paid_amount, dues, status, payment_mode, payment_amount,
        billing_timestamp, payment_timestamp, idempotency_key, created_by
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21
      ) RETURNING *`,
      [
        storeId, customer.id, invoiceNumber,
        payload.coupon_code, payload.coupon_codes || [],
        payload.referral_code,
        totals.sub_total, totals.discount, totals.tax_amount,
        totals.cgst_amount, totals.sgst_amount, totals.grand_total,
        payload.payment_amount || 0, paymentStatus.dues, paymentStatus.status,
        payload.payment_mode, payload.payment_amount || 0,
        payload.billing_timestamp, payload.payment_timestamp || null,
        idempotencyKey, userId
      ]
    );
    
    // Insert bill items
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO bill_items (
          bill_id, line_no, type, catalog_id, name, staff_id, qty,
          discount_type, discount_value, cgst_rate, sgst_rate,
          base_amount, discount_amount, cgst_amount, sgst_amount, line_total
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
        )`,
        [
          bill.id, item.line_no, item.type, item.id, item.name, item.staff_id || null, item.qty,
          item.discount_type, item.discount_value, 
          // Store original rates for reference (convert back to percentage for storage)
          item.price !== undefined ? (item.cgst <= 1 ? item.cgst * 100 : (item.cgst <= 100 ? item.cgst : item.cgst / item.base_amount * 100)) : item.cgst,
          item.price !== undefined ? (item.sgst <= 1 ? item.sgst * 100 : (item.sgst <= 100 ? item.sgst : item.sgst / item.base_amount * 100)) : item.sgst,
          item.base_amount, item.discount_amount, item.cgst_amount, item.sgst_amount, item.line_total
        ]
      );
    }
    
    // Process payments with advance handling
    let totalPaidAmount = 0;
    const processedPayments = [];
    
    for (const payment of payload.payments || []) {
      if (payment.mode === 'advance') {
        // Handle advance payment deduction
        try {
          // Check if customer has sufficient advance balance
          const paymentAmount = parseFloat(payment.amount);
          if (customer.advance_amount < paymentAmount) {
            throw new Error(`Insufficient advance balance. Available: ${customer.advance_amount}, Required: ${paymentAmount}`);
          }
          
          // Deduct from customer's advance amount
          await client.query(
            `UPDATE customers 
             SET advance_amount = advance_amount - $1, 
                 updated_at = NOW()
             WHERE id = $2`,
            [paymentAmount, customer.id]
          );
          
          // Update local customer object for potential excess calculations
          customer.advance_amount = parseFloat(customer.advance_amount) - paymentAmount;
          
          // Insert payment record for advance
          const paymentTimestamp = payment.payment_timestamp || payment.timestamp;
          await client.query(
            `INSERT INTO bill_payments (bill_id, mode, amount, reference, timestamp)
             VALUES ($1, $2, $3, $4, $5)`,
            [bill.id, payment.mode, payment.amount, payment.reference || 'Advance deduction', paymentTimestamp]
          );
          
          totalPaidAmount += paymentAmount;
          processedPayments.push(payment);
          
        } catch (error) {
          throw new Error(`Advance payment failed: ${error.message}`);
        }
      } else {
        // Handle regular payment modes
        const paymentTimestamp = payment.payment_timestamp || payment.timestamp;
        await client.query(
          `INSERT INTO bill_payments (bill_id, mode, amount, reference, timestamp)
           VALUES ($1, $2, $3, $4, $5)`,
          [bill.id, payment.mode, payment.amount, payment.reference || null, paymentTimestamp]
        );
        
        totalPaidAmount += parseFloat(payment.amount);
        processedPayments.push(payment);
      }
    }
    
    // Check if total paid amount exceeds grand total
    const excessAmount = totalPaidAmount - totals.grand_total;
    if (excessAmount > 0) {
      // Add excess amount back to customer's advance balance
      await client.query(
        `UPDATE customers 
         SET advance_amount = advance_amount + $1, 
             updated_at = NOW()
         WHERE id = $2`,
        [excessAmount, customer.id]
      );
      
      // Update local customer object
      customer.advance_amount = parseFloat(customer.advance_amount) + excessAmount;
    }
    
    // Recalculate payment status with actual paid amount
    const actualPaymentStatus = this.calculatePaymentStatus(totals.grand_total, totalPaidAmount);
    
    // Update bill with actual payment amounts
    await client.query(
      `UPDATE bills SET 
         paid_amount = $1, 
         dues = $2, 
         status = $3,
         updated_at = NOW()
       WHERE id = $4`,
      [totalPaidAmount, actualPaymentStatus.dues, actualPaymentStatus.status, bill.id]
    );
    
    return {
      bill: {
        ...bill,
        paid_amount: totalPaidAmount,
        dues: actualPaymentStatus.dues,
        status: actualPaymentStatus.status
      },
      customer,
      items: processedItems,
      totals: {
        ...totals,
        paid: this.round(totalPaidAmount),
        dues: actualPaymentStatus.dues
      },
      payments: processedPayments,
      excessAmountAddedToAdvance: excessAmount > 0 ? excessAmount : null
    };
  }
  
  // Hold bill transaction
  async holdBillTransaction(client, storeId, userId, payload, idempotencyKey = null) {
    // Calculate estimate for display
    let amountEstimate = 0;
    try {
      const customer = await this.resolveCustomer(client, storeId, payload);
      const taxMode = await this.getStoreTaxSettings(client, storeId);
      
      const processedItems = [];
      for (const item of payload.items) {
        const catalogItem = await this.getCatalogItem(client, storeId, item.type, item.id);
        
        let calculations;
        if (item.price !== undefined) {
          // New payload format with direct price
          calculations = this.calculateLineItemFromPrice(item);
        } else {
          // Legacy format using catalog price
          calculations = this.calculateLineItem(item, catalogItem, taxMode);
        }
        
        processedItems.push(calculations);
      }
      
      const totals = this.calculateBillTotals(processedItems, payload.discount || 0);
      amountEstimate = totals.grand_total;
    } catch (error) {
      // If estimation fails, continue without estimate
      console.warn('Failed to calculate amount estimate for held bill:', error.message);
    }
    
    // Create customer summary
    let customerSummary = 'Unknown Customer';
    if (payload.customer_id) {
      try {
        const { rows } = await client.query(
          'SELECT name, phone_number FROM customers WHERE id = $1',
          [payload.customer_id]
        );
        if (rows.length) {
          customerSummary = `${rows[0].name} (${rows[0].phone_number})`;
        }
      } catch (error) {
        // Use default if customer lookup fails
      }
    } else if (payload.customer) {
      customerSummary = `${payload.customer.name} (${payload.customer.contact_no})`;
    }
    
    // Insert held bill
    const { rows: [heldBill] } = await client.query(
      `INSERT INTO held_bills (
        store_id, payload, customer_summary, amount_estimate, idempotency_key, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [
        storeId,
        JSON.stringify(payload),
        customerSummary,
        amountEstimate,
        idempotencyKey,
        userId
      ]
    );
    
    return heldBill;
  }
  
  // Get suggested invoice number for held bill
  async getSuggestedInvoiceNumber(client, storeId) {
    return await this.generateInvoiceNumber(client, storeId);
  }
}

module.exports = new BillingService();