# Zenga Treasury AI Agent - Implementation Plan

**Date Created:** February 17, 2026  
**Status:** Planning  
**Target Delivery:** Week 2 (Feb 24-28)  
**Primary Use Case:** Autonomous treasury operations (fund transfers, reconciliation)

---

## 1. Architecture Overview

```
User Goal
   ↓
[Agent Orchestrator] ← reads company context, policies, current state
   ↓
[Decision Engine] ← GPT-4o with treasury tool definitions
   ↓
[Tool Interface] ← mapped to Zenga services
   ├─ TransferFunds (wallet → wallet)
   ├─ ReconcilePayments (match pending vs settled)
   ├─ ReclassifyTransactions (move between buckets)
   ├─ CheckBalance (query wallets)
   └─ CheckCompliance (KYC, limits, blacklist)
   ↓
[Safety Layer] ← approval threshold checks
   ├─ < $1000 auto-approve
   ├─ $1000-$10k require user confirmation
   └─ > $10k require admin override
   ↓
[Audit Trail] → logs all decisions + approvals
   ↓
Execution Result
```

---

## 2. Implementation Phases

### Phase 1: Agent Core (Day 1-2)

**Objective:** Build the agentic loop foundation

1. Create `AITreasuryAgent` service with OpenAI function calling
2. Define treasurer "tools" as structured JSON schema
3. Implement agentic loop (think → act → observe → repeat)

**Code Pattern:**
```typescript
while (goalNotComplete) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    functions: treasuryTools, // TransferFunds, ReconcilePayments, etc.
    function_call: "auto"
  });
  
  if (response.function_call) {
    const result = await executeTool(response.function_call);
    // Add result back to conversation for agent feedback
  }
}
```

**Deliverables:**
- `/src/services/aiTreasuryAgent.ts` - Main agentic loop
- `/src/services/treasuryTools.ts` - Tool definitions & schemas
- Agent can iterate up to 10 times before requiring human intervention

---

### Phase 2: Tool Definitions (Day 2-3)

**Objective:** Map OpenAI functions to existing Zenga services

| Function | Mapped Service | Purpose |
|----------|----------------|---------|
| `transfer_funds` | `walletService.transferBetweenWallets()` | Move funds between company wallets |
| `reconcile_payments` | `transactionService.compareSettledVsPending()` | Match pending vs settled transactions |
| `check_balance` | `walletService.getWalletBalance()` | Query wallet balances |
| `get_company_policy` | Company entity (daily limit, counterparties) | Retrieve company treasury rules |
| `check_counterparty_kyc` | `kycService.verifyCounterparty()` | Validate recipient is KYC-approved |
| `log_agent_action` | New `auditLog` table | Record agent decisions |

**Tool Schema Example:**
```typescript
{
  name: "transfer_funds",
  description: "Transfer funds between wallets",
  parameters: {
    type: "object",
    properties: {
      fromWalletId: { type: "string" },
      toWalletId: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      reason: { type: "string" }
    },
    required: ["fromWalletId", "toWalletId", "amount", "currency"]
  }
}
```

---

### Phase 3: Safety & Compliance (Day 3)

**Objective:** Implement guardrails and approval workflows

**Pre-Execution Checks:**
1. Verify counterparty is whitelisted (from Company.approvedCounterparties)
2. Check daily transfer limit (from Company.dailyTransferLimit)
3. Verify KYC status of recipient
4. Check for fraud patterns (sudden large transfers, unusual times, etc.)
5. Verify user has treasury permission level

**Approval Workflow:**
- **< $1000:** Auto-execute (immidiately proceed)
- **$1000 - $10k:** Require user confirmation (send approval request via email/UI)
- **> $10k:** Require admin override (only admins can approve)
- **Flagged patterns:** Always require manual review (block until approved)

**New DB Entity - AgentAction:**
```typescript
@Entity()
export class AgentAction {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  companyId: string;

  @Column()
  action: string; // transfer_funds, reconcile, etc.

  @Column("jsonb")
  parameters: Record<string, unknown>;

  @Column("jsonb")
  result: Record<string, unknown>;

  @Column({ type: "enum", enum: ["PENDING", "APPROVED", "EXECUTED", "REJECTED", "FAILED"] })
  status: "PENDING" | "APPROVED" | "EXECUTED" | "REJECTED" | "FAILED";

  @Column({ nullable: true })
  approvedByUserId: string;

  @Column({ type: "timestamp", default: () => "CURRENT_TIMESTAMP" })
  createdAt: Date;

  @Column({ nullable: true })
  executedAt: Date;
}
```

---

### Phase 4: API Endpoint (Day 4)

**Objective:** Expose agent functionality via REST API

**Endpoint:** `POST /ai-treasury/execute`

**Request Body:**
```json
{
  "goal": "reconcile all pending USD transfers",
  "dryRun": true,
  "maxApprovalAmount": 10000,
  "companyId": "uuid"
}
```

**Response:**
```json
{
  "agentId": "agent_123",
  "goal": "reconcile all pending USD transfers",
  "status": "PLANNING",
  "plan": [
    {
      "step": 1,
      "action": "get_pending_transactions",
      "result": "Found 12 pending USD transfers, $50,234.50 total"
    },
    {
      "step": 2,
      "action": "check_counterparties",
      "result": "8 whitelisted, 4 need verification"
    }
  ],
  "requiresApproval": true,
  "approvalThreshold": "$50,234.50",
  "estimatedExecutionTime": "2 minutes",
  "dryRunResults": [...],
  "nextAction": "AWAITING_USER_CONFIRMATION"
}
```

**Controller Endpoints:**
- `POST /ai-treasury/execute` - Start agent execution
- `GET /ai-treasury/status/:agentId` - Check agent progress
- `POST /ai-treasury/approve/:agentId` - Approve pending action
- `POST /ai-treasury/reject/:agentId` - Reject action
- `GET /ai-treasury/history` - View past agent actions

---

### Phase 5: Frontend UI (Day 5)

**Objective:** Build dashboard for monitoring & approving agent actions

**Components:**
1. **Agent Dashboard** (`AgentDashboard.tsx`)
   - Real-time agent execution log
   - Currently running agents
   - Next pending action

2. **Approval Panel** (`ApprovalPanel.tsx`)
   - Shows waiting-for-approval transfers
   - Amount, counterparty, reason
   - Approve/Reject buttons

3. **Execution History** (`AgentHistory.tsx`)
   - Past agent actions with outcomes
   - Filterable by date, action type, status
   - Export audit trail

4. **Settings** (`AgentSettings.tsx`)
   - Set daily limits per wallet
   - Configure approval thresholds
   - Whitelist/blacklist counterparties

---

## 3. Key Decisions

| Decision | Reasoning |
|----------|-----------|
| **Agentic loops** | Agent can self-correct (reconcile, recheck, retry) rather than one-shot responses. Better for complex treasury tasks. |
| **Function calling** | Safer than letting AI generate arbitrary code; all tools are pre-approved & sandboxed. |
| **Thresholds** | < $1000 auto-approve (speed); > $10k needs human (safety & compliance). Mid-range requires confirmation. |
| **Audit first** | Log every action + reasoning before executing. Enables rollback & compliance audits. |
| **Dry-run mode** | User previews agent's plan before execution. Catches mistakes early. |
| **Max 10 iterations** | Prevents infinite loops if agent gets confused. Falls back to human review. |
| **Daily limits** | Company sets daily transfer limit; agent respects it or prompts for extension. |
| **Whitelisting** | Agent can only transfer to pre-approved counterparties (security best practice). |

---

## 4. Example Execution Flow

**Scenario:** Treasury manager says "Reconcile all pending USD payments to contractors"

```
User Input:
  goal: "Reconcile all pending USD payments to contractors"
  dryRun: false

Agent Iteration 1 (Think):
  "I need to find all pending USD transactions to contractors"
  Action: get_pending_transactions(currency: "USD", category: "contractor")

Agent Iteration 2 (Observe):
  Result: Found 12 pending contracts, $50,234.50 total
  "Now I need to check which counterparties are approved"
  Action: get_company_policy()

Agent Iteration 3 (Think):
  Result: Company daily limit is $30k, already spent $6k today
  "Can transfer $24k today. Need to verify 4 counterparties"
  Action: check_counterparty_kyc(counterpartyIds: ['c1', 'c2', 'c3', 'c4'])

Agent Iteration 4 (Observe):
  Result: 8 whitelisted, 4 pending KYC verification
  "I'll transfer to the 8 whitelisted, flag the 4 for review"
  Action: transfer_funds(fromWallet: "treasury", toWallet: ["contractor_1", ..., "contractor_8"], amount: 24000)

Agent Iteration 5 (Observe):
  Result: Successfully transferred $24,000 to 8 contractors
  "Reconciliation complete for approved counterparties"
  Action: log_agent_action(success: true, ...)

Final Response:
  ✅ Reconciled 8 contracts ($24,000)
  ⏳ 4 contracts awaiting KYC verification ($26,234.50)
  💰 Daily limit remaining: $6,000
```

---

## 5. Tech Stack

- **AI Model:** OpenAI GPT-4o (function calling)
- **Backend Framework:** Express + TypeORM (existing)
- **Database:** PostgreSQL (add AgentAction entity)
- **Services:** Leverage existing walletService, transactionService
- **Frontend:** React (existing velo_bulk)
- **Logging:** Winston or Pino (for audit trail)

---

## 6. Success Metrics

By end of Week 2:
- [ ] Agent can execute 5+ treasury operations autonomously
- [ ] 0 unapproved large transfers (all > $10k caught)
- [ ] < 2min response time for agent planning
- [ ] 100% audit trail coverage (every action logged)
- [ ] Frontend approval UI tested by 2+ treasury managers
- [ ] Integration tests passing (10+ scenarios)

---

## 7. Future Enhancements (Week 3+)

- [ ] Multi-currency support (auto-detect currency needs)
- [ ] Predictive reconciliation (forecast month-end balance)
- [ ] Learning from approvals (agent improves threshold predictions)
- [ ] Slack/Teams notifications (real-time alerts)
- [ ] Webhook triggers (external events → agent actions)
- [ ] Voice input (Treasury manager speaks goal via Slack)

---

## 8. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Agent transfers wrong amount | High ($) | Always require approval for > $1000 |
| Agent can't reach OpenAI | Medium | Fallback to manual execution mode |
| Audit log grows too large | Low | Partition by date, archive old records |
| Counterparty whitelist outdated | Medium | Daily sync from HR system |
| Agent loops infinitely | Low | Hard limit of 10 iterations |

---

## 9. Success Checklist

- [x] Architecture designed
- [x] Tech stack identified
- [ ] Phase 1: Core agent loop (started)
- [ ] Phase 2: Tool definitions (started)
- [ ] Phase 3: Safety layer (started)
- [ ] Phase 4: API endpoints (started)
- [ ] Phase 5: Frontend UI (started)
- [ ] Integration tests
- [ ] Load testing (1000 transactions/day)
- [ ] Security audit
- [ ] Production deployment
- [ ] Team training

---

**Next Step:** Start Phase 1 implementation. Create AITreasuryAgent service with agentic loop.

