// /**
//  * Test script for Day 1 (Database) and Day 2 (AI Services)
//  */
// import { AppDataSource } from "./src/config/database";
// import { PMRoadmap } from "./src/entities/PMRoadmap";
// import { PMTask } from "./src/entities/PMTask";
// import { PMTaskAssignment } from "./src/entities/PMTaskAssignment";
// import { PMConversation } from "./src/entities/PMConversation";
// import { EmployeePerformance } from "./src/entities/EmployeePerformance";
// import { PMConversationService } from "./src/services/pmConversationService";
// import { PMTaskService } from "./src/services/pmTaskService";

// const COMPANY_ID = "test-company-001";

// async function testDay1_Database() {
//   console.log("\n🔍 === DAY 1: DATABASE TESTS ===\n");

//   try {
//     // Test 1: Check all repositories exist
//     console.log("✅ Test 1: Checking database repositories...");
//     const roadmapRepo = AppDataSource.getRepository(PMRoadmap);
//     const taskRepo = AppDataSource.getRepository(PMTask);
//     const assignmentRepo = AppDataSource.getRepository(PMTaskAssignment);
//     const conversationRepo = AppDataSource.getRepository(PMConversation);
//     const performanceRepo = AppDataSource.getRepository(EmployeePerformance);
//     console.log("   ✓ All repositories accessible");

//     // Test 2: Create a PMRoadmap
//     console.log("\n✅ Test 2: Creating PMRoadmap...");
//     const roadmap = roadmapRepo.create({
//       companyId: COMPANY_ID,
//       goal: "Complete dashboard and admin section",
//       timeline: "this week",
//       status: "planning",
//     });
//     const savedRoadmap = await roadmapRepo.save(roadmap);
//     console.log(`   ✓ PMRoadmap created: ${savedRoadmap.id}`);

//     // Test 3: Create PMTasks
//     console.log("\n✅ Test 3: Creating PMTasks...");
//     const tasksData = [
//       { title: "Design dashboard UI", description: "Create mockups", phase: "phase1", effortHours: 8, priority: "high" as const },
//       { title: "Build dashboard backend", description: "API endpoints", phase: "phase1", effortHours: 12, priority: "high" as const },
//       { title: "Admin authentication", description: "Login system", phase: "phase2", effortHours: 6, priority: "medium" as const },
//     ];

//     const tasks = [];
//     for (const taskData of tasksData) {
//       const task = taskRepo.create({
//         roadmapId: savedRoadmap.id,
//         ...taskData,
//       });
//       const savedTask = await taskRepo.save(task);
//       tasks.push(savedTask);
//       console.log(`   ✓ Task created: "${savedTask.title}" (${savedTask.id})`);
//     }

//     // Test 4: Query all tasks for the roadmap
//     console.log("\n✅ Test 4: Querying tasks...");
//     const queriedTasks = await taskRepo.find({ where: { roadmapId: savedRoadmap.id } });
//     console.log(`   ✓ Retrieved ${queriedTasks.length} tasks for roadmap`);

//     // Test 5: Create PMConversation
//     console.log("\n✅ Test 5: Creating PMConversation...");
//     const conversation = conversationRepo.create({
//       companyId: COMPANY_ID,
//       messages: [
//         { role: "user", content: "Complete dashboard and admin section", timestamp: new Date().toISOString() },
//         { role: "assistant", content: "I'll break this down into smaller tasks", timestamp: new Date().toISOString() },
//       ],
//       context: { goal: "Complete dashboard and admin section", timeline: "this week" },
//     });
//     const savedConversation = await conversationRepo.save(conversation);
//     console.log(`   ✓ PMConversation created: ${savedConversation.id}`);

//     // Test 6: Check EmployeePerformance
//     console.log("\n✅ Test 6: Checking EmployeePerformance entity...");
//     const performance = await performanceRepo.find({ take: 1 });
//     console.log(`   ✓ EmployeePerformance table exists (${await performanceRepo.count()} records)`);

//     console.log("\n✅ === DAY 1 TESTS PASSED ===\n");
//     return true;
//   } catch (error) {
//     console.error("\n❌ === DAY 1 TESTS FAILED ===");
//     console.error(error);
//     return false;
//   }
// }

// async function testDay2_AIServices() {
//   console.log("\n🔍 === DAY 2: AI SERVICES TESTS ===\n");

//   try {
//     // Test 1: PMConversationService - Start conversation
//     console.log("✅ Test 1: Starting PM conversation with goal...");
//     const conversationResponse = await PMConversationService.startConversation({
//       companyId: COMPANY_ID,
//       goal: "Build a mobile app for employee timesheets handling",
//     });
//     console.log(`   ✓ Conversation started: ${conversationResponse.conversation.id}`);
//     console.log(`   ✓ AI generated questions: ${conversationResponse.questions.length}`);
//     conversationResponse.questions.forEach((q, i) => {
//       console.log(`     - Q${i + 1}: ${q}`);
//     });

//     // Test 2: PMTaskService - Generate tasks from goal
//     console.log("\n✅ Test 2: Generating task breakdown from goal...");
//     const tasks = await PMTaskService.generateTasks({
//       goal: "Build a mobile app for employee timesheets handling",
//       timeline: "2 weeks",
//       priorityOrder: "frontend_first",
//     });
//     console.log(`   ✓ AI generated ${tasks.length} tasks:`);
//     tasks.forEach((task, i) => {
//       console.log(`     Task ${i + 1}: "${task.title}"`);
//       console.log(`       - Phase: ${task.phase}`);
//       console.log(`       - Effort: ${task.effortHours}h`);
//       console.log(`       - Priority: ${task.priority}`);
//       if (task.dependencyTitles?.length) {
//         console.log(`       - Dependencies: ${task.dependencyTitles.join(", ")}`);
//       }
//     });

//     // Test 3: Generate tasks with context
//     console.log("\n✅ Test 3: Generating tasks with timeline and priority context...");
//     const contextualTasks = await PMTaskService.generateTasks({
//       goal: "Implement payment gateway integration",
//       timeline: "this week",
//       priorityOrder: "backend_first",
//     });
//     console.log(`   ✓ Generated ${contextualTasks.length} tasks with context`);
//     console.log(`   ✓ Average effort per task: ${(contextualTasks.reduce((sum, t) => sum + (t.effortHours || 0), 0) / contextualTasks.length).toFixed(1)}h`);

//     console.log("\n✅ === DAY 2 TESTS PASSED ===\n");
//     return true;
//   } catch (error) {
//     console.error("\n❌ === DAY 2 TESTS FAILED ===");
//     console.error(error);
//     return false;
//   }
// }

// async function runAllTests() {
//   console.log("=" * 50);
//   console.log("ZENGA SPRINT TESTS: Day 1 & Day 2");
//   console.log("=" * 50);

//   // Initialize database
//   console.log("\n📡 Connecting to database...");
//   if (!AppDataSource.isInitialized) {
//     await AppDataSource.initialize();
//     console.log("✓ Database connected");
//   }

//   const day1Pass = await testDay1_Database();
//   const day2Pass = await testDay2_AIServices();

//   console.log("\n" + "=" * 50);
//   console.log("TEST SUMMARY");
//   console.log("=" * 50);
//   console.log(`Day 1 (Database):     ${day1Pass ? "✅ PASSED" : "❌ FAILED"}`);
//   console.log(`Day 2 (AI Services):  ${day2Pass ? "✅ PASSED" : "❌ FAILED"}`);
//   console.log("=" * 50 + "\n");

//   process.exit(day1Pass && day2Pass ? 0 : 1);
// }

// runAllTests().catch((err) => {
//   console.error("Fatal error:", err);
//   process.exit(1);
// });
