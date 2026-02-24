# Week 1 Sprint Plan: AI Task Planner with Auto-Assignment

**Goal:** By Saturday, any PM can type a sprint goal and get an AI-generated task breakdown with smart employee assignments in 5 seconds.

**Timeline:** Monday, Feb 16 - Saturday, Feb 21, 2026

---

## **Monday (Day 1): Database Foundation**

**Goal:** Set up all database entities and relationships

**Tasks:**
- [ ] Create `PMRoadmap` entity (id, companyId, goal, timeline, status, createdAt)
- [ ] Create `PMTask` entity (id, roadmapId, title, description, effort, priority, dependencies)
- [ ] Create `PMTaskAssignment` entity (id, taskId, employeeId, assignedBy, reason, status)
- [ ] Create `PMConversation` entity (id, companyId, messages, context)
- [ ] Create `EmployeePerformance` entity (dummy seed data for now)
- [ ] Run migrations
- [ ] Test relationships and queries

**Deliverable:** All tables created, can insert/query data

**Time Estimate:** 6-8 hours

---

## **Tuesday (Day 2): Backend Services - AI Logic**

**Goal:** Build AI conversation and task generation

**Tasks:**
- [ ] Install OpenAI SDK: `npm install openai`
- [ ] Create `src/services/pmConversationService.ts`
  - AI chat handling (questions/responses)
  - Context management
  - Goal extraction
- [ ] Create `src/services/pmTaskService.ts`
  - Task breakdown from goals (AI prompt engineering)
  - Effort estimation logic
  - Dependency detection
- [ ] Create dummy performance data seeder
  - 5-10 sample employee profiles
  - Success rates, skills, load percentages
- [ ] Test AI generates 8-12 tasks from sample goals

**Deliverable:** AI can break down goals into tasks (tested in isolation)

**Time Estimate:** 8-10 hours

---

## **Wednesday (Day 3): Backend Services - Assignment Algorithm**

**Goal:** Smart employee matching system

**Tasks:**
- [ ] Create `src/services/pmAssignmentService.ts`
  - Fetch company employees via existing endpoint
  - Match tasks to employees by:
    - Role (Frontend/Backend/Designer)
    - Skills (from dummy data)
    - Current load
    - Historical success rate
  - Generate explanation/reasoning
- [ ] Create `src/controllers/pmRoadmapController.ts`
  - `createRoadmap()` - Start conversation
  - `generatePlan()` - Create sprint with assignments
  - `getRoadmap()` - Fetch plan
  - `updateAssignment()` - Override
- [ ] Create `src/routes/pmRoadmapRoute.ts`
- [ ] Wire up to app.ts
- [ ] Test with Postman/curl

**Deliverable:** API endpoints work, return JSON with assignments

**Time Estimate:** 8-10 hours

---

## **Thursday (Day 4): Frontend - UI Components**

**Goal:** Build PM dashboard and chat interface

**Tasks:**
- [ ] Create `src/pages/PMDashboard.tsx` (velo_bulk)
  - Dashboard landing page
  - "Create Sprint Plan" button
  - List of saved plans
- [ ] Create `src/components/pm/SprintPlanner.tsx`
  - Text input for goal
  - Chat interface (messages back/forth)
  - Timeline/priority selectors
- [ ] Create `src/components/pm/SprintPlanView.tsx`
  - Task list grouped by phase
  - Assignment cards showing employee + reason
  - Edit/override buttons
- [ ] Create `src/services/pmRoadmapService.ts` (API client)
- [ ] Add route `/pm` to App.tsx
- [ ] Basic styling

**Deliverable:** UI renders, can type goals, see chat responses

**Time Estimate:** 8-10 hours

---

## **Friday (Day 5): Integration + Polish**

**Goal:** Connect frontend to backend, end-to-end flow

**Tasks:**
- [ ] Hook up chat to backend `/pm/conversation`
- [ ] Hook up plan generation to `/pm/roadmap/generate`
- [ ] Display generated tasks with assignments
- [ ] Implement override assignment feature
- [ ] Add loading states (spinners during AI processing)
- [ ] Add error handling (API failures, timeouts)
- [ ] Test complete flow:
  - Type goal → Chat → Generate → View → Edit → Save
- [ ] Fix critical bugs
- [ ] Deploy backend to staging
- [ ] Deploy frontend to staging
- [ ] Test on staging environment

**Deliverable:** Full working feature on staging, ready for demo

**Time Estimate:** 8-10 hours

---

## **Saturday (Day 6): Testing & Demo Prep**

**Goal:** QA, gather feedback, prepare for Monday launch

**Tasks:**
- [ ] Test with 3-5 different sprint goals:
  - "Build Starknet integration"
  - "Improve KYC completion flow"
  - "Add referral program"
  - "Fix wallet sync bugs"
  - "Launch mobile app MVP"
- [ ] Verify assignments make sense for each
- [ ] Test edge cases:
  - Empty employee list
  - All employees on leave
  - Very complex goals
  - Very simple goals
- [ ] Invite 2-3 PMs to test
- [ ] Collect feedback
- [ ] Fix any show-stopper bugs
- [ ] Prepare demo screenshots/video
- [ ] Document feature for team

**Deliverable:** Production-ready feature, tested by real users, ready to ship Monday

**Time Estimate:** 4-6 hours

---

## Time Estimates Summary

| Day | Focus | Hours |
|-----|-------|-------|
| Monday | Database | 6-8 |
| Tuesday | AI Logic | 8-10 |
| Wednesday | Assignment Algorithm + API | 8-10 |
| Thursday | Frontend UI | 8-10 |
| Friday | Integration + Deploy | 8-10 |
| Saturday | Testing + QA | 4-6 |
| **Total** | | **48-54 hours** |

---

## Critical Path (Don't Skip)

1. ✅ Database entities (Monday)
2. ✅ AI task generation (Tuesday)
3. ✅ Assignment algorithm (Wednesday)
4. ✅ Basic UI (Thursday morning)
5. ✅ Integration (Friday)

Everything else can be simplified if behind schedule.

---

## Success Criteria (Saturday Evening)

✅ PM can describe ANY sprint goal in plain English  
✅ AI asks smart follow-up questions  
✅ AI pulls real employees from company database  
✅ AI generates 6-15 tasks automatically  
✅ Tasks are auto-assigned with clear reasoning  
✅ PM can change assignments  
✅ Sprint plan saves and persists  
✅ Works for any company with employees  

---

## Example Demo Flow (Saturday)

**PM Types:**
```
"Build Starknet integration for our wallet - 
 users should be able to send and receive STRK tokens"
```

**AI Responds in 3 seconds:**
```
📋 SPRINT PLAN: Starknet Wallet Integration

I see you have 4 developers available:
• Chidi Okonkwo (Frontend)
• Ada Nnamdi (Backend) 
• Emeka Johnson (Full Stack)
• Ngozi Eze (Designer)

Questions:
1. Timeline: [This week] [2 weeks] [By month-end]
2. Priority: [Backend first] [UI first] [Parallel]
```

**PM Selects:** "2 weeks, backend first"

**AI Generates:**
```
✅ SPRINT PLAN CREATED

WEEK 1: Backend Foundation (Days 1-5)
├─ Research Starknet wallet standards [8h]
   👤 Ada Nnamdi (Backend Developer)
   Why: Backend expert, 94% success rate, researched 
        Bitcoin/Solana integrations before

├─ Add Starknet to database schema [6h]
   👤 Ada Nnamdi (Backend Developer)
   Why: Needs same dev for consistency

├─ Starknet wallet creation API [12h]
   👤 Emeka Johnson (Full Stack)
   Why: Available, 87% backend success, learning opportunity

WEEK 2: Frontend & Testing (Days 6-10)
├─ Design STRK wallet UI mockups [8h]
   👤 Ngozi Eze (Designer)
   Why: UI/UX expert, designed Solana/ETH wallet screens

├─ Build wallet UI components [14h]
   👤 Chidi Okonkwo (Frontend Developer)
   Why: 89% React success, completed similar wallet UIs

Total: 66 hours / 4 devs / 10 days = Feasible ✅

[Edit Assignments] [Save Plan] [Export]
```

---

## What's NOT Included (Week 2+)

❌ Voice input (text only)  
❌ Real performance tracking (uses dummy data)  
❌ WhatsApp notifications  
❌ Advanced simulations  
❌ Burnout prediction (basic load checks only)  
❌ Integration with Jira/Linear  

---

## Tech Stack

**Backend (ZENGA):**
- Node.js + TypeScript
- PostgreSQL + TypeORM
- OpenAI API (GPT-4)

**Frontend (velo_bulk):**
- React + TypeScript
- Vite
- Existing styling system

**APIs:**
- Existing: `GET /auth/company/employees`
- New: `POST /pm/conversation`
- New: `POST /pm/roadmap/generate`
- New: `GET /pm/roadmap/:id`
- New: `PUT /pm/roadmap/:id/assign`

---

## Start Monday 8 AM 🚀

**Next Action:** Create database entities Monday morning

---

*Last updated: February 15, 2026*  
*Owner: ZENGA Engineering Team*
