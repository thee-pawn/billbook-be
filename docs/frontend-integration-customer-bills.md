# Frontend Integration Guide - Customer Bills API

## Overview
This guide shows how to integrate the Customer Bills API using real response data from the billbook backend.

## API Endpoint
```
GET /api/v1/billing/{storeId}/customers/{customerId}/bills
```

## Key Features Demonstrated

### 1. **Customer Summary Statistics** 📊
```javascript
const summary = response.data.summary;

// Display customer financial overview
const customerStats = {
  totalBills: summary.total_bills,        // 9 bills
  totalBilled: summary.total_billed,      // ₹1,185.32
  totalPaid: summary.total_paid,          // ₹772.50
  outstandingDues: summary.total_dues,    // ₹530.40
  billsWithDues: summary.bills_with_dues  // 7 bills pending
};
```

### 2. **Due Bills Filter** 🔥 (Main Feature)
```javascript
// Get only bills with outstanding payments
const getDueBills = async (customerId) => {
  const response = await fetch(
    `/api/v1/billing/${storeId}/customers/${customerId}/bills?due_only=true`
  );
  return response.json();
};

// Filter due bills from response
const dueBills = response.data.bills.filter(bill => bill.dues > 0);
// Results: 7 out of 9 bills have pending payments
```

### 3. **Payment Status Analysis** 💰
```javascript
const analyzePaymentStatus = (bills) => {
  const statusBreakdown = {
    paid: bills.filter(b => b.payment_status === 'paid').length,      // 2 bills
    partial: bills.filter(b => b.payment_status === 'partial').length, // 6 bills  
    unpaid: bills.filter(b => b.payment_status === 'unpaid').length    // 1 bill
  };
  
  const overdueBills = bills.filter(b => b.is_overdue);
  const highPriorityBills = bills
    .filter(b => b.dues > 100)
    .sort((a, b) => b.dues - a.dues);
    
  return { statusBreakdown, overdueBills, highPriorityBills };
};
```

### 4. **Frontend Components Examples**

#### Customer Summary Card
```jsx
const CustomerSummaryCard = ({ customer, summary }) => (
  <div className="customer-summary-card">
    <h3>{customer.name}</h3>
    <p>{customer.phone_number}</p>
    
    <div className="financial-overview">
      <div className="stat">
        <span>Total Bills</span>
        <strong>{summary.total_bills}</strong>
      </div>
      <div className="stat">
        <span>Total Billed</span>
        <strong>₹{summary.total_billed}</strong>
      </div>
      <div className="stat alert">
        <span>Outstanding</span>
        <strong>₹{summary.total_dues}</strong>
      </div>
      <div className="stat warning">
        <span>Pending Bills</span>
        <strong>{summary.bills_with_dues}</strong>
      </div>
    </div>
  </div>
);
```

#### Due Bills List
```jsx
const DueBillsList = ({ bills }) => {
  const dueBills = bills.filter(bill => bill.dues > 0);
  
  return (
    <div className="due-bills-list">
      <h4>Outstanding Payments ({dueBills.length})</h4>
      {dueBills.map(bill => (
        <div key={bill.bill_id} className="due-bill-item">
          <div className="bill-info">
            <span className="invoice-number">{bill.invoice_number}</span>
            <span className="bill-date">
              {new Date(bill.billing_timestamp).toLocaleDateString()}
            </span>
          </div>
          
          <div className="payment-info">
            <div className="amounts">
              <span>Total: ₹{bill.grand_total}</span>
              <span>Paid: ₹{bill.paid}</span>
              <span className="due-amount">Due: ₹{bill.dues}</span>
            </div>
            
            <span className={`status ${bill.payment_status}`}>
              {bill.payment_status.toUpperCase()}
            </span>
          </div>
          
          {bill.is_overdue && (
            <span className="overdue-badge">OVERDUE</span>
          )}
        </div>
      ))}
    </div>
  );
};
```

#### Complete Integration Component
```jsx
const CustomerBillHistory = ({ storeId, customerId }) => {
  const [billsData, setBillsData] = useState(null);
  const [showDueOnly, setShowDueOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCustomerBills();
  }, [customerId, showDueOnly]);

  const loadCustomerBills = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: 1,
        limit: 100,
        ...(showDueOnly && { due_only: 'true' }),
        sort: 'date_desc'
      });

      const response = await fetch(
        `/api/v1/billing/${storeId}/customers/${customerId}/bills?${params}`,
        {
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const result = await response.json();
      if (result.success) {
        setBillsData(result.data);
      }
    } catch (error) {
      console.error('Failed to load customer bills:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading customer bills...</div>;
  if (!billsData) return <div>Failed to load bills</div>;

  return (
    <div className="customer-bill-history">
      <CustomerSummaryCard 
        customer={billsData.customer} 
        summary={billsData.summary} 
      />

      <div className="bills-section">
        <div className="bills-header">
          <h3>Bill History</h3>
          <label className="filter-toggle">
            <input
              type="checkbox"
              checked={showDueOnly}
              onChange={(e) => setShowDueOnly(e.target.checked)}
            />
            Show Due Bills Only ({billsData.summary.bills_with_dues})
          </label>
        </div>

        <DueBillsList bills={billsData.bills} />
        
        {billsData.pagination.has_more && (
          <button onClick={() => loadMoreBills()}>
            Load More Bills
          </button>
        )}
      </div>
    </div>
  );
};
```

## Real Data Analysis from Response

### Customer: Pawan Kumar (+919973984944)

**Financial Summary:**
- **Total Bills**: 9
- **Total Amount**: ₹1,185.32
- **Total Paid**: ₹772.50
- **Outstanding**: ₹530.40
- **Bills with Dues**: 7 out of 9

**Payment Status Breakdown:**
- ✅ **Paid**: 2 bills (₹235 total)
- ⚠️ **Partial**: 6 bills (₹462.75 outstanding)  
- ❌ **Unpaid**: 1 bill (₹236 due)

**Key Insights:**
1. **High Due Rate**: 77% of bills have pending payments
2. **Payment Pattern**: Customer tends to make partial payments (₹50-₹117.50)
3. **Recent Activity**: Most bills from Sept 26-27, 2025
4. **Referral Usage**: Consistent use of referral code "EJM0AR0C"

## API Usage Patterns

### 1. Due Bills Dashboard
```javascript
// Primary use case - show only outstanding bills
fetch(`/api/v1/billing/${storeId}/customers/${customerId}/bills?due_only=true&sort=amount_desc`)
```

### 2. Payment Follow-up
```javascript
// Get overdue bills for collections
const overdueFilter = (bill) => bill.is_overdue && bill.dues > 0;
const priorityBills = bills.filter(overdueFilter).sort((a, b) => b.dues - a.dues);
```

### 3. Customer Analytics
```javascript
// Analyze payment behavior
const paymentBehavior = {
  averageBillAmount: summary.total_billed / summary.total_bills,  // ₹131.70
  paymentRate: (summary.total_paid / summary.total_billed) * 100, // 65.2%
  averageDue: summary.total_dues / summary.bills_with_dues        // ₹75.77
};
```

## Error Handling

```javascript
const handleApiResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json();
    switch (response.status) {
      case 404:
        showError('Customer not found in this store');
        break;
      case 403:
        showError('Access denied to store data');
        break;
      default:
        showError(error.message || 'Failed to load customer bills');
    }
    return null;
  }
  return response.json();
};
```

## Performance Optimization

```javascript
// Use pagination for large datasets
const loadBillsInBatches = async (customerId, batchSize = 20) => {
  let page = 1;
  let allBills = [];
  let hasMore = true;

  while (hasMore) {
    const response = await fetch(
      `/api/v1/billing/${storeId}/customers/${customerId}/bills?page=${page}&limit=${batchSize}`
    );
    const data = await response.json();
    
    allBills.push(...data.data.bills);
    hasMore = data.data.pagination.has_more;
    page++;
  }

  return allBills;
};
```

This integration guide provides everything needed to implement customer bill management with the `due_only` filter as the primary feature for payment follow-up workflows.