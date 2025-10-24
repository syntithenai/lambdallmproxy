# Credit System Implementation Plan

**Status**: Ready for Implementation  
**Created**: 2025-10-24  
**Estimated Duration**: 24-33 hours  
**Target**: Public access with credit-based billing at ai.syntithenai.com

---

## Executive Summary

This plan removes the whitelist authentication system and replaces it with a public credit-based access model. All new users receive $0.50 welcome credit, costs are marked up 4x for profit margin, and users can purchase additional credits via PayPal integration.

### Key Changes
- ✅ Remove email whitelist validation
- ✅ Auto-create user sheets on first login with $0.50 welcome credit
- ✅ Apply 4x markup on Lambda infrastructure costs only (LLM API costs passed through)
- ✅ Replace $3.00 hard limit with dynamic credit balance enforcement
- ✅ Add PayPal payment integration for credit purchases
- ✅ Update billing page to show credit balance and purchase options
- ✅ Add credit warnings with payment prompts

---

## Policy Decisions (Resolved)

| Question | Decision |
|----------|----------|
| **Minimum Credit Purchase** | $5.00 minimum |
| **Credit Expiration** | No expiration |
| **Refund Policy** | No refunds |
| **Email Notifications** | No receipt emails |
| **Multiple OAuth Providers** | Single provider (Google only) |
| **Failed Payments** | User retries manually (no auto-retry) |
| **Currency** | USD only |
| **Sales Tax** | No tax collection |

---

## Phase 1: Backend Authentication Changes (6-8 hours)

### 1.1. Remove Whitelist Validation
**File**: `src/middleware/auth.js`

**Current Behavior**:
```javascript
// Lines 50-60
const VALID_USERS = (process.env.VALID_USERS || '').split(',').map(e => e.trim()).filter(Boolean);

if (!VALID_USERS.includes(email)) {
  throw new Error(`User ${email} is not authorized to use this service`);
}
```

**New Behavior**:
- Remove `VALID_USERS` environment variable check entirely
- Keep token signature verification (security remains intact)
- All authenticated Google users can access the service

**Changes**:
```javascript
// Remove whitelist check
// Keep only:
// 1. Token signature verification
// 2. Email extraction from verified token
// 3. Return { email, valid: true }
```

**Files to Update**:
- `src/middleware/auth.js` - Remove whitelist logic
- `.env.example` - Remove `VALID_USERS` variable
- `README.md` - Update authentication documentation

---

### 1.2. Auto-Create User Sheets with Welcome Credit
**File**: `src/services/user-billing-sheet.js`

**Function**: `ensureUserSheetExists(email)`

**Current Behavior**:
- Creates sheet tab for user email
- Adds header row only

**New Behavior**:
- Create sheet tab (existing logic)
- Add header row (existing logic)
- **Add welcome credit row**:
  ```javascript
  {
    timestamp: new Date().toISOString(),
    email: userEmail,
    provider: 'system',
    model: 'welcome_credit',
    type: 'credit_added',
    cost: '-0.50',  // Negative = credit added
    tokens: 0,
    metadata: 'Welcome credit for new user'
  }
  ```

**Implementation**:
```javascript
async function ensureUserSheetExists(email) {
  // ... existing sheet creation logic ...
  
  // Check if this is a new sheet (no data rows)
  const existingData = await getSheetData(sheetName);
  const isNewSheet = existingData.length <= 1; // Only header row
  
  if (isNewSheet) {
    console.log('🎁 Adding welcome credit for new user:', email);
    await appendToSheet(sheetName, [{
      timestamp: new Date().toISOString(),
      email: email,
      provider: 'system',
      model: 'welcome_credit',
      type: 'credit_added',
      cost: '-0.50',
      tokens: 0,
      metadata: 'Welcome credit - enjoy exploring!'
    }]);
  }
  
  return sheetName;
}
```

**Edge Cases**:
- User sheet exists but is empty (has headers): Add welcome credit
- User sheet has data: Skip welcome credit (existing user)
- Sheet creation fails: Propagate error (don't add credit to wrong place)

---

### 1.3. Implement 4x Profit Margin on Lambda Costs Only
**Files**: All cost calculation endpoints

**Pricing Model**:
- **LLM API Costs**: Pass-through (user pays exact provider cost)
- **Lambda Infrastructure**: 4x markup for profit margin
- Example: Groq charges $0.10 for tokens + $0.0001 Lambda cost → User billed $0.10 + ($0.0001 × 4) = $0.1004

**Lambda Cost Components**:
1. **Compute Cost**: Memory × Duration × $0.0000166667 per GB-second
2. **Request Cost**: $0.0000002 per request
3. **Total Lambda Cost**: Compute + Request
4. **User Charged**: LLM Cost + (Lambda Cost × 4)

**Files to Modify**:
1. **`src/endpoints/chat.js`** (lines ~500-550)
   - Separate LLM cost from Lambda cost
   - Apply 4x markup only to Lambda cost
   
2. **`src/endpoints/generate-image.js`** (lines ~200-250)
   - Image generation API cost (pass-through)
   - Lambda cost (4x markup)

3. **`src/endpoints/tts.js`** (lines ~300-350)
   - TTS API cost (pass-through)
   - Lambda cost (4x markup)

4. **`src/tools.js`** (transcribe_audio tool, lines ~800-850)
   - Transcription API cost (pass-through)
   - Lambda cost (4x markup)

5. **`src/endpoints/rag.js`** (handleEmbedSnippets, handleEmbedQuery)
   - Embedding API cost (pass-through)
   - Lambda cost (4x markup)

**Implementation Pattern**:
```javascript
// Calculate LLM cost (pass-through)
const llmCost = (inputTokens * inputPrice) + (outputTokens * outputPrice);

// Calculate Lambda infrastructure cost
const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
const durationSeconds = executionDuration / 1000;
const computeCost = memoryGB * durationSeconds * 0.0000166667;
const requestCost = 0.0000002;
const lambdaCost = computeCost + requestCost;

// Apply profit margin only to Lambda cost
const LAMBDA_PROFIT_MARGIN = 4;
const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;

// Total user cost
const totalUserCost = llmCost + lambdaCostWithMargin;
```

**Add to `.env`**:
```bash
# Profit margin multiplier for Lambda infrastructure costs only
# LLM API costs are passed through directly to users
LAMBDA_PROFIT_MARGIN=4
```

**Logging Enhancement**:
```javascript
console.log(`💰 Cost breakdown:`);
console.log(`   LLM API: $${llmCost.toFixed(6)} (pass-through)`);
console.log(`   Lambda: $${lambdaCost.toFixed(6)} × ${LAMBDA_PROFIT_MARGIN} = $${lambdaCostWithMargin.toFixed(6)}`);
console.log(`   Total user cost: $${totalUserCost.toFixed(6)}`);
```

**Cost Display**:
- Show breakdown in billing logs: `LLM: $0.0020 + Lambda: $0.0004 = Total: $0.0024`
- Transparency: Users see exactly what they pay for LLM vs infrastructure

---

### 1.4. Replace Hard Limit with Credit Balance Check
**Files**: 
- `src/endpoints/chat.js`
- `src/endpoints/generate-image.js`
- `src/endpoints/tts.js`
- `src/tools.js` (transcribe_audio)

**Current Logic**:
```javascript
// In chat.js, lines ~100-120
if (totalCost > 3.00) {
  return {
    statusCode: 402,
    body: JSON.stringify({
      error: 'Cost limit exceeded',
      message: 'Total cost exceeds $3.00 limit'
    })
  };
}
```

**New Logic**:
```javascript
// 1. Calculate user's current credit balance
const creditBalance = await getUserCreditBalance(userEmail);

// 2. Estimate cost of current request
const estimatedCost = await estimateRequestCost(requestParams);

// 3. Check if user has sufficient credit
if (creditBalance < estimatedCost) {
  return {
    statusCode: 402,
    body: JSON.stringify({
      error: 'Insufficient credit',
      message: `Credit balance: $${creditBalance.toFixed(2)}. Required: $${estimatedCost.toFixed(2)}. Please add credit to continue.`,
      creditBalance: creditBalance,
      estimatedCost: estimatedCost,
      addCreditUrl: 'https://ai.syntithenai.com/#billing'
    })
  };
}

// 4. Process request and log cost
// ... existing logic ...
```

**New Function**: `getUserCreditBalance(email)`
**File**: `src/services/user-billing-sheet.js`

```javascript
/**
 * Calculate user's current credit balance from billing sheet
 * @param {string} email - User email
 * @returns {Promise<number>} Current credit balance (positive = has credit)
 */
async function getUserCreditBalance(email) {
  const sheetName = emailToSheetName(email);
  const rows = await getSheetData(sheetName);
  
  let balance = 0;
  
  for (const row of rows) {
    const cost = parseFloat(row.cost || 0);
    
    if (row.type === 'credit_added') {
      // Credits are stored as negative costs
      balance += Math.abs(cost);
    } else {
      // Regular usage costs
      balance -= cost;
    }
  }
  
  console.log(`💳 Credit balance for ${email}: $${balance.toFixed(4)}`);
  return balance;
}

module.exports = {
  logToBillingSheet,
  ensureUserSheetExists,
  getUserCreditBalance,  // NEW EXPORT
};
```

**Cost Estimation Functions** (add to each endpoint):
```javascript
// In chat.js
async function estimateChatCost(messages, model) {
  // Rough token estimation (4 chars per token)
  const totalChars = messages.reduce((sum, m) => sum + m.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  
  // Get model pricing from PROVIDER_CATALOG (pass-through)
  const modelInfo = findModelInCatalog(model);
  const avgPrice = (modelInfo.inputPrice + modelInfo.outputPrice) / 2;
  const llmCost = estimatedTokens * avgPrice;
  
  // Estimate Lambda cost (with 4x markup)
  const estimatedDuration = 2000; // 2 seconds typical
  const memoryGB = parseInt(process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE || '256') / 1024;
  const lambdaCost = (memoryGB * (estimatedDuration / 1000) * 0.0000166667) + 0.0000002;
  const lambdaCostWithMargin = lambdaCost * 4;
  
  return llmCost + lambdaCostWithMargin;
}

// Similar functions for image generation, TTS, transcription
```

---

## Phase 2: PayPal Integration (8-10 hours)

### 2.1. PayPal Setup & Configuration

**Prerequisites**:
1. Create PayPal Business Account at https://developer.paypal.com
2. Create REST API App in PayPal Developer Dashboard
3. Get Client ID and Secret for both Sandbox and Live environments

**Environment Variables** (`.env`):
```bash
# PayPal Configuration
PAYPAL_MODE=sandbox  # 'sandbox' or 'live'
PAYPAL_CLIENT_ID=AYourClientIDHere
PAYPAL_CLIENT_SECRET=YourClientSecretHere
PAYPAL_SUCCESS_URL=https://ai.syntithenai.com/api/paypal/success
PAYPAL_CANCEL_URL=https://ai.syntithenai.com/#billing

# Credit Purchase Settings
MIN_CREDIT_PURCHASE=5.00

# Profit margin for Lambda infrastructure costs only
# LLM API costs are passed through to users
LAMBDA_PROFIT_MARGIN=4
```

### 2.2. Backend PayPal Endpoints

**New File**: `src/endpoints/paypal.js`

```javascript
const { OAuth2Client } = require('google-auth-library');
const paypal = require('@paypal/checkout-server-sdk');
const { appendToSheet } = require('../services/user-billing-sheet');

// PayPal environment setup
function getPayPalClient() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  const mode = process.env.PAYPAL_MODE || 'sandbox';
  
  const environment = mode === 'live'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
  
  return new paypal.core.PayPalHttpClient(environment);
}

/**
 * Create PayPal order for credit purchase
 * POST /paypal/create-order
 * Body: { amount: 5.00, userEmail: "user@example.com" }
 */
async function handleCreateOrder(event) {
  try {
    // 1. Authenticate user
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No auth token' }) };
    }
    
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: token });
    const { email } = ticket.getPayload();
    
    // 2. Validate purchase amount
    const { amount } = JSON.parse(event.body);
    const minPurchase = parseFloat(process.env.MIN_CREDIT_PURCHASE || '5.00');
    
    if (amount < minPurchase) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: `Minimum purchase is $${minPurchase.toFixed(2)}`
        })
      };
    }
    
    // 3. Create PayPal order
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: amount.toFixed(2)
        },
        description: `AI Credits - ${email}`,
        custom_id: email  // Store email for callback
      }],
      application_context: {
        brand_name: 'Syntithenai AI',
        user_action: 'PAY_NOW',
        return_url: process.env.PAYPAL_SUCCESS_URL,
        cancel_url: process.env.PAYPAL_CANCEL_URL
      }
    });
    
    const paypalClient = getPayPalClient();
    const order = await paypalClient.execute(request);
    
    console.log('✅ PayPal order created:', order.result.id);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        orderId: order.result.id,
        approveUrl: order.result.links.find(l => l.rel === 'approve').href
      })
    };
    
  } catch (error) {
    console.error('❌ PayPal order creation failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create payment order' })
    };
  }
}

/**
 * Capture PayPal payment and add credit
 * POST /paypal/capture-order
 * Body: { orderId: "PAYPAL_ORDER_ID" }
 */
async function handleCaptureOrder(event) {
  try {
    // 1. Authenticate user
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No auth token' }) };
    }
    
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: token });
    const { email } = ticket.getPayload();
    
    // 2. Capture PayPal order
    const { orderId } = JSON.parse(event.body);
    
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    const paypalClient = getPayPalClient();
    const capture = await paypalClient.execute(request);
    
    // 3. Verify payment success
    if (capture.result.status !== 'COMPLETED') {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: 'Payment not completed',
          status: capture.result.status
        })
      };
    }
    
    // 4. Extract payment details
    const amount = parseFloat(capture.result.purchase_units[0].amount.value);
    const paypalEmail = capture.result.payer.email_address;
    const transactionId = capture.result.purchase_units[0].payments.captures[0].id;
    
    // 5. Add credit to user's billing sheet
    const sheetName = email.replace(/[^a-z0-9]/gi, '_');
    
    await appendToSheet(sheetName, [{
      timestamp: new Date().toISOString(),
      email: email,
      provider: 'paypal',
      model: 'credit_purchase',
      type: 'credit_added',
      cost: `-${amount.toFixed(2)}`,  // Negative = credit
      tokens: 0,
      metadata: `PayPal transaction ${transactionId} from ${paypalEmail}`
    }]);
    
    console.log(`✅ Added $${amount} credit to ${email} (PayPal: ${transactionId})`);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        creditAdded: amount,
        transactionId: transactionId
      })
    };
    
  } catch (error) {
    console.error('❌ PayPal capture failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to process payment' })
    };
  }
}

module.exports = {
  handleCreateOrder,
  handleCaptureOrder
};
```

### 2.3. Add PayPal Routes to Lambda Handler

**File**: `src/index.js`

```javascript
// Add to route handling
const { handleCreateOrder, handleCaptureOrder } = require('./endpoints/paypal');

// In main handler routing:
if (path === '/paypal/create-order' && method === 'POST') {
  return handleCreateOrder(event);
}

if (path === '/paypal/capture-order' && method === 'POST') {
  return handleCaptureOrder(event);
}
```

### 2.4. Add PayPal SDK Dependency

**File**: `package.json`

```json
{
  "dependencies": {
    "@paypal/checkout-server-sdk": "^1.0.3",
    // ... existing dependencies
  }
}
```

**After adding**: Run `npm install` and `make setup-layer` to rebuild Lambda layer

---

## Phase 3: Frontend UI Updates (8-10 hours)

### 3.1. Update Billing Page to Show Credits

**File**: `ui-new/src/components/BillingTab.tsx`

**Current State**: Shows transaction list from Google Sheets

**New Features**:
1. **Credit Balance Display** (prominent header)
2. **Transaction List** (existing, with credit transactions highlighted)
3. **Add Credit Button** (launches PayPal flow)

**UI Mockup**:
```
┌─────────────────────────────────────────────┐
│  💳 Credit Balance: $12.45                  │
│                                             │
│  [➕ Add Credit]                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│  Recent Transactions                         │
│  ─────────────────────────────────────────  │
│  ✅ Welcome Credit        +$0.50            │
│  📝 Chat (llama-3.1-8b)   -$0.0020          │
│  💳 PayPal Purchase       +$5.00            │
│  🎨 Image Generation      -$0.0400          │
└─────────────────────────────────────────────┘
```

**Implementation**:

```typescript
import { useAuth } from '../contexts/AuthContext';
import { getCachedApiBase } from '../utils/api';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';

export const BillingTab: React.FC = () => {
  const { getToken, user } = useAuth();
  const [creditBalance, setCreditBalance] = useState<number>(0);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showAddCredit, setShowAddCredit] = useState(false);
  const [purchaseAmount, setPurchaseAmount] = useState(5.00);
  
  // Fetch transactions and calculate balance
  useEffect(() => {
    async function loadBillingData() {
      const apiUrl = await getCachedApiBase();
      const token = await getToken();
      
      const response = await fetch(`${apiUrl}/billing/transactions`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      const data = await response.json();
      
      // Calculate balance
      let balance = 0;
      for (const tx of data.transactions) {
        const cost = parseFloat(tx.cost || 0);
        if (tx.type === 'credit_added') {
          balance += Math.abs(cost);
        } else {
          balance -= cost;
        }
      }
      
      setCreditBalance(balance);
      setTransactions(data.transactions);
    }
    
    loadBillingData();
  }, []);
  
  // PayPal payment handlers
  async function createOrder() {
    const apiUrl = await getCachedApiBase();
    const token = await getToken();
    
    const response = await fetch(`${apiUrl}/paypal/create-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ amount: purchaseAmount })
    });
    
    const { orderId } = await response.json();
    return orderId;
  }
  
  async function onApprove(data: any) {
    const apiUrl = await getCachedApiBase();
    const token = await getToken();
    
    const response = await fetch(`${apiUrl}/paypal/capture-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ orderId: data.orderID })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Refresh billing data
      window.location.reload();
    }
  }
  
  return (
    <div className="billing-tab">
      {/* Credit Balance Card */}
      <div className="credit-balance-card">
        <h2>💳 Credit Balance</h2>
        <div className="balance-amount">
          ${creditBalance.toFixed(2)}
        </div>
        <button onClick={() => setShowAddCredit(true)}>
          ➕ Add Credit
        </button>
      </div>
      
      {/* Add Credit Dialog */}
      {showAddCredit && (
        <div className="add-credit-dialog">
          <h3>Purchase Credits</h3>
          <p>Minimum purchase: $5.00</p>
          
          <input
            type="number"
            min="5"
            step="5"
            value={purchaseAmount}
            onChange={(e) => setPurchaseAmount(parseFloat(e.target.value))}
          />
          
          <PayPalScriptProvider options={{ 
            "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
            currency: "USD"
          }}>
            <PayPalButtons
              createOrder={createOrder}
              onApprove={onApprove}
              onError={(err) => console.error('PayPal error:', err)}
            />
          </PayPalScriptProvider>
          
          <button onClick={() => setShowAddCredit(false)}>Cancel</button>
        </div>
      )}
      
      {/* Transaction List */}
      <div className="transaction-list">
        <h3>Recent Transactions</h3>
        {transactions.map((tx, idx) => (
          <div 
            key={idx} 
            className={`transaction ${tx.type === 'credit_added' ? 'credit' : 'usage'}`}
          >
            <span className="tx-icon">
              {tx.type === 'credit_added' ? '💳' : getTypeIcon(tx.type)}
            </span>
            <span className="tx-description">
              {tx.model} {tx.metadata && `(${tx.metadata})`}
            </span>
            <span className={`tx-amount ${tx.type === 'credit_added' ? 'positive' : 'negative'}`}>
              {tx.type === 'credit_added' ? '+' : '-'}${Math.abs(parseFloat(tx.cost)).toFixed(4)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
```

### 3.2. Add Credit Warning Dialog

**New File**: `ui-new/src/components/CreditWarningDialog.tsx`

```typescript
import React from 'react';
import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';

interface CreditWarningDialogProps {
  currentBalance: number;
  estimatedCost: number;
  onClose: () => void;
  onCreditAdded: () => void;
}

export const CreditWarningDialog: React.FC<CreditWarningDialogProps> = ({
  currentBalance,
  estimatedCost,
  onClose,
  onCreditAdded
}) => {
  const shortfall = estimatedCost - currentBalance;
  const suggestedPurchase = Math.max(5, Math.ceil(shortfall));
  
  return (
    <div className="credit-warning-overlay">
      <div className="credit-warning-dialog">
        <h2>⚠️ Insufficient Credit</h2>
        
        <div className="credit-details">
          <p>Current Balance: <strong>${currentBalance.toFixed(2)}</strong></p>
          <p>Estimated Cost: <strong>${estimatedCost.toFixed(2)}</strong></p>
          <p>Shortfall: <strong className="negative">${shortfall.toFixed(2)}</strong></p>
        </div>
        
        <div className="credit-notice">
          <p><strong>Note:</strong> Credit is required even if you provide your own API keys.</p>
          <p>This covers infrastructure costs (Lambda, storage, bandwidth).</p>
        </div>
        
        <h3>Purchase Credits</h3>
        <p>Suggested amount: ${suggestedPurchase.toFixed(2)}</p>
        
        <PayPalScriptProvider options={{ 
          "client-id": import.meta.env.VITE_PAYPAL_CLIENT_ID,
          currency: "USD"
        }}>
          <PayPalButtons
            createOrder={async () => {
              // Call backend to create order
              const token = await getToken();
              const apiUrl = await getCachedApiBase();
              
              const response = await fetch(`${apiUrl}/paypal/create-order`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ amount: suggestedPurchase })
              });
              
              const { orderId } = await response.json();
              return orderId;
            }}
            onApprove={async (data) => {
              // Capture payment
              const token = await getToken();
              const apiUrl = await getCachedApiBase();
              
              await fetch(`${apiUrl}/paypal/capture-order`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ orderId: data.orderID })
              });
              
              onCreditAdded();
            }}
          />
        </PayPalScriptProvider>
        
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
};
```

### 3.3. Integrate Credit Warnings into Chat/Tools

**File**: `ui-new/src/components/ChatTab.tsx`

**Add before API calls**:
```typescript
// Before sending chat message
const checkCredit = async () => {
  const apiUrl = await getCachedApiBase();
  const token = await getToken();
  
  const response = await fetch(`${apiUrl}/billing/check-credit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      estimatedTokens: Math.ceil(input.length / 4),
      model: selectedModel
    })
  });
  
  if (response.status === 402) {
    const { creditBalance, estimatedCost } = await response.json();
    setShowCreditWarning(true);
    setCreditWarningData({ creditBalance, estimatedCost });
    return false;
  }
  
  return true;
};

// Before sendMessage
const hasCredit = await checkCredit();
if (!hasCredit) return;
```

### 3.4. Update Environment Variables

**File**: `ui-new/.env.example`

```bash
# PayPal Configuration
VITE_PAYPAL_CLIENT_ID=your_paypal_client_id_here
```

### 3.5. Add PayPal Dependencies

**File**: `ui-new/package.json`

```json
{
  "dependencies": {
    "@paypal/react-paypal-js": "^8.1.3",
    // ... existing dependencies
  }
}
```

Run: `cd ui-new && npm install`

---

## Phase 4: New Backend Endpoints (3-4 hours)

### 4.1. Get User Transactions Endpoint

**New Function in**: `src/endpoints/billing.js`

```javascript
const { OAuth2Client } = require('google-auth-library');
const { getSheetData, emailToSheetName } = require('../services/user-billing-sheet');

/**
 * Get user's billing transactions
 * GET /billing/transactions
 */
async function handleGetTransactions(event) {
  try {
    // Authenticate
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No auth token' }) };
    }
    
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: token });
    const { email } = ticket.getPayload();
    
    // Get transactions from service account sheet
    const sheetName = emailToSheetName(email);
    const rows = await getSheetData(sheetName);
    
    // Parse and return
    const transactions = rows.map(row => ({
      timestamp: row.timestamp,
      type: row.type,
      model: row.model,
      provider: row.provider,
      cost: row.cost,
      tokens: row.tokens,
      metadata: row.metadata
    }));
    
    return {
      statusCode: 200,
      body: JSON.stringify({ transactions })
    };
    
  } catch (error) {
    console.error('❌ Failed to get transactions:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve transactions' })
    };
  }
}

/**
 * Check if user has sufficient credit for operation
 * POST /billing/check-credit
 * Body: { estimatedTokens: 1000, model: "llama-3.1-8b" }
 */
async function handleCheckCredit(event) {
  try {
    // Authenticate
    const authHeader = event.headers.Authorization || event.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');
    
    if (!token) {
      return { statusCode: 401, body: JSON.stringify({ error: 'No auth token' }) };
    }
    
    const client = new OAuth2Client();
    const ticket = await client.verifyIdToken({ idToken: token });
    const { email } = ticket.getPayload();
    
    // Get current balance
    const balance = await getUserCreditBalance(email);
    
    // Estimate cost
    const { estimatedTokens, model } = JSON.parse(event.body);
    const modelInfo = findModelInCatalog(model);
    const avgPrice = (modelInfo.inputPrice + modelInfo.outputPrice) / 2;
    const llmCost = estimatedTokens * avgPrice;
    
    // Add Lambda cost (4x markup)
    const LAMBDA_PROFIT_MARGIN = parseFloat(process.env.LAMBDA_PROFIT_MARGIN || '4');
    const lambdaCost = 0.0001; // Rough estimate for typical request
    const lambdaCostWithMargin = lambdaCost * LAMBDA_PROFIT_MARGIN;
    
    const estimatedCost = llmCost + lambdaCostWithMargin;
    
    // Check if sufficient
    if (balance < estimatedCost) {
      return {
        statusCode: 402,
        body: JSON.stringify({
          error: 'Insufficient credit',
          creditBalance: balance,
          estimatedCost: estimatedCost,
          shortfall: estimatedCost - balance
        })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        sufficient: true,
        creditBalance: balance,
        estimatedCost: estimatedCost
      })
    };
    
  } catch (error) {
    console.error('❌ Failed to check credit:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to check credit' })
    };
  }
}

module.exports = {
  handleGetTransactions,
  handleCheckCredit
};
```

### 4.2. Add Routes to Lambda Handler

**File**: `src/index.js`

```javascript
const { handleGetTransactions, handleCheckCredit } = require('./endpoints/billing');

// In routing section
if (path === '/billing/transactions' && method === 'GET') {
  return handleGetTransactions(event);
}

if (path === '/billing/check-credit' && method === 'POST') {
  return handleCheckCredit(event);
}
```

---

## Phase 5: Testing & Deployment (3-5 hours)

### 5.1. Testing Checklist

**Backend Tests**:
- [ ] New user login creates sheet with $0.50 credit
- [ ] getUserCreditBalance() calculates correctly
- [ ] Credit check blocks requests when balance < cost
- [ ] 4x markup applies to all cost calculations
- [ ] PayPal order creation works (sandbox)
- [ ] PayPal capture adds credit to sheet
- [ ] Transaction retrieval endpoint works

**Frontend Tests**:
- [ ] Billing page shows credit balance
- [ ] Billing page shows transaction list
- [ ] Add credit button opens PayPal dialog
- [ ] PayPal payment flow completes successfully
- [ ] Credit warning appears on insufficient balance
- [ ] Credit warning has "Add Credit" button
- [ ] Page refreshes after credit purchase

**Integration Tests**:
- [ ] End-to-end: New user → Welcome credit → Chat → Low credit warning → Purchase → Continue chatting
- [ ] PayPal sandbox to production transition
- [ ] Mobile responsiveness of payment dialogs
- [ ] Error handling for failed payments

### 5.2. Deployment Steps

1. **Backend**:
   ```bash
   # Update dependencies
   npm install @paypal/checkout-server-sdk
   
   # Rebuild Lambda layer
   make setup-layer
   
   # Deploy environment variables
   make deploy-env
   
   # Deploy Lambda function
   make deploy-lambda-fast
   ```

2. **Frontend**:
   ```bash
   cd ui-new
   npm install @paypal/react-paypal-js
   npm run build
   cd ..
   make deploy-ui
   ```

3. **Environment Configuration**:
   - Update `.env` with PayPal credentials
   - Set `LAMBDA_PROFIT_MARGIN=4`
   - Remove `VALID_USERS` variable
   - Run `make deploy-env`

4. **PayPal Configuration**:
   - Switch from sandbox to live environment
   - Update `PAYPAL_MODE=live`
   - Update `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` with live credentials
   - Configure webhook URLs in PayPal dashboard

### 5.3. Monitoring

**CloudWatch Logs** - Watch for:
- `🎁 Adding welcome credit for new user`
- `💰 Cost breakdown: LLM API: $X (pass-through) + Lambda: $Y × 4 = $Z`
- `💳 Credit balance for {email}: $Z`
- `✅ PayPal order created`
- `✅ Added $X credit to {email}`

**Google Sheets** - Verify:
- New user sheets have welcome credit row
- Credit purchase transactions appear correctly
- Cost values show LLM pass-through + Lambda markup
- Balance calculations are accurate

---

## Phase 6: Documentation & Migration (2-3 hours)

### 6.1. Update README.md

**Add sections**:
- **Credit System**: How it works, pricing model
- **Payment Methods**: PayPal integration
- **Welcome Credit**: $0.50 for new users
- **Pricing**: 4x markup disclosure

### 6.2. User-Facing Documentation

Create: `docs/PRICING.md`

```markdown
# Pricing & Credits

## Welcome Credit
New users receive **$0.50 in free credit** to explore the platform.

## Credit System
- Credits never expire
- Minimum purchase: $5.00
- All major credit cards accepted via PayPal
- No refunds on purchased credits

## Pricing
All API costs include a 4x markup on Lambda infrastructure only:
- Chat: LLM cost (pass-through) + Lambda infrastructure ($0.0004/request with 4x markup)
- Images: Provider cost (pass-through) + Lambda infrastructure ($0.0004/request with 4x markup)
- TTS: Provider cost (pass-through) + Lambda infrastructure ($0.0004/request with 4x markup)
- Transcription: Provider cost (pass-through) + Lambda infrastructure ($0.0004/request with 4x markup)

**Example Chat Cost**:
- Groq API: $0.0020 (1000 tokens × $0.002/1K) - pass-through
- Lambda: $0.0001 (compute + request) × 4 = $0.0004 markup
- Total user cost: $0.0024

## Custom API Keys
Even with your own API keys, credits are required to cover:
- AWS Lambda compute costs (4x markup for profit)
- Google Sheets storage/logging
- Bandwidth and infrastructure

## Support
For billing questions: steve@syntithenai.com
```

### 6.3. Migration Plan

**Existing Users**:
- Whitelist users continue to work (email check removed)
- Add $10 credit to existing user sheets as migration bonus
- Send email notification about new credit system

**Script**: `scripts/migrate-existing-users.js`

```javascript
// Add $10 credit to all existing user sheets
const existingUsers = [
  'syntithenai@gmail.com',
  'janariwayne@gmail.com',
  // ... other whitelist users
];

for (const email of existingUsers) {
  await appendToSheet(emailToSheetName(email), [{
    timestamp: new Date().toISOString(),
    email: email,
    provider: 'system',
    model: 'migration_bonus',
    type: 'credit_added',
    cost: '-10.00',
    tokens: 0,
    metadata: 'Migration bonus - thank you for being an early user!'
  }]);
}
```

---

## Implementation Timeline

| Phase | Tasks | Duration | Dependencies |
|-------|-------|----------|--------------|
| **Phase 1** | Backend auth changes | 6-8 hours | None |
| **Phase 2** | PayPal integration | 8-10 hours | Phase 1 complete |
| **Phase 3** | Frontend UI updates | 8-10 hours | Phase 2 complete |
| **Phase 4** | Backend endpoints | 3-4 hours | Phase 1 complete |
| **Phase 5** | Testing & deployment | 3-5 hours | All phases complete |
| **Phase 6** | Documentation & migration | 2-3 hours | Phase 5 complete |
| **Total** | | **24-33 hours** | |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PayPal integration issues | Medium | High | Use sandbox extensively, have fallback manual credit system |
| Credit calculation errors | Low | High | Comprehensive unit tests, manual verification |
| Users abuse welcome credit | Medium | Low | IP-based rate limiting, email verification required |
| Payment fraud | Low | Medium | PayPal's built-in fraud protection, monitor unusual patterns |
| Frontend payment flow breaks | Low | Medium | Extensive browser testing, graceful error handling |

---

## Success Metrics

**Week 1**:
- [ ] 50+ new user signups
- [ ] 80%+ welcome credit utilization
- [ ] 10+ credit purchases
- [ ] Zero payment failures

**Month 1**:
- [ ] 500+ registered users
- [ ] $500+ revenue from credit purchases
- [ ] <1% support tickets related to billing
- [ ] 95%+ payment success rate

---

## Rollback Plan

If critical issues arise:

1. **Immediate**: Re-enable whitelist check in `auth.js`
2. **Payment Issues**: Disable PayPal routes, enable manual credit requests
3. **Cost Calculation Bug**: Revert to pass-through pricing temporarily
4. **Complete Rollback**: 
   ```bash
   git revert <credit-system-commit>
   make deploy-lambda-fast
   make deploy-ui
   ```

---

## Next Steps

1. **Review this plan** - Confirm all decisions align with business goals
2. **Set up PayPal account** - Get sandbox and production credentials
3. **Start Phase 1** - Remove whitelist, add welcome credit
4. **Iterative testing** - Test each phase before proceeding
5. **Soft launch** - Deploy to production, monitor for 48 hours
6. **Full launch** - Announce on social media, update marketing materials

---

**Document Version**: 1.0  
**Last Updated**: 2025-10-24  
**Next Review**: After Phase 1 completion
