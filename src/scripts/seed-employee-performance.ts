import { AppDataSource } from "../config/database";
import { Employee, EmploymentStatus } from "../entities/Employee";
import { EmployeePerformance, BurnoutRiskLevel } from "../entities/EmployeePerformance";

const ROLE_KEYWORDS: Array<{ role: string; keywords: string[]; strengths: string[] }> = [
  { role: "Frontend Developer", keywords: ["front", "react", "ui", "css"], strengths: ["React", "UI", "CSS"] },
  { role: "Backend Developer", keywords: ["back", "api", "node", "db"], strengths: ["Node.js", "API", "Database"] },
  { role: "Full Stack Developer", keywords: ["full", "stack"], strengths: ["React", "Node.js", "Database"] },
  { role: "Designer", keywords: ["design", "ui", "ux"], strengths: ["UX", "UI", "Figma"] },
  { role: "QA", keywords: ["qa", "test"], strengths: ["Testing", "Automation", "Bug Bash"] },
  { role: "DevOps", keywords: ["devops", "infra", "deploy"], strengths: ["CI/CD", "Infra", "Monitoring"] },
];

const lcg = (seed: number) => {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
};

const seedFromString = (value: string): number => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
};

const pickRole = (employee: Employee): { role: string; strengths: string[] } => {
  const text = `${employee.position || ""} ${employee.department || ""}`.toLowerCase();
  for (const candidate of ROLE_KEYWORDS) {
    if (candidate.keywords.some((kw) => text.includes(kw))) {
      return { role: candidate.role, strengths: candidate.strengths };
    }
  }
  return { role: "Full Stack Developer", strengths: ["React", "Node.js", "Database"] };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const buildPerformance = (employee: Employee) => {
  const seed = seedFromString(employee.id || employee.email || "employee");
  const rand = lcg(seed);
  const role = pickRole(employee);

  const baseSuccess = Math.round(70 + rand() * 28);
  const baseOnTime = Math.round(65 + rand() * 30);
  const baseLoad = Math.round(30 + rand() * 50);
  const velocityWeekly = Math.round(3 + rand() * 10);
  const velocitySprint = Math.round(10 + rand() * 30);
  const avgCycleTimeHours = Math.round(8 + rand() * 64);

  const currentLoad = employee.employmentStatus === EmploymentStatus.ON_LEAVE
    ? 0
    : clamp(baseLoad, 10, 85);

  let burnoutRisk = BurnoutRiskLevel.LOW;
  if (currentLoad >= 80) burnoutRisk = BurnoutRiskLevel.HIGH;
  if (currentLoad >= 60 && currentLoad < 80) burnoutRisk = BurnoutRiskLevel.MEDIUM;

  return {
    role: role.role,
    strengths: role.strengths,
    successRate: clamp(baseSuccess, 60, 98),
    onTimeRate: clamp(baseOnTime, 55, 98),
    currentLoad,
    velocityWeekly: clamp(velocityWeekly, 2, 15),
    velocitySprint: clamp(velocitySprint, 6, 45),
    avgCycleTimeHours: clamp(avgCycleTimeHours, 6, 96),
    burnoutRisk,
  };
};

const shouldRefresh = () => process.argv.includes("--refresh");

const seedEmployeePerformance = async () => {
  try {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }

    const employeeRepo = AppDataSource.getRepository(Employee);
    const performanceRepo = AppDataSource.getRepository(EmployeePerformance);

    const employees = await employeeRepo.find();
    if (employees.length === 0) {
      console.log("[Seed] No employees found. Skipping.");
      process.exit(0);
    }

    const refresh = shouldRefresh();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const employee of employees) {
      const existing = await performanceRepo.findOne({
        where: { employeeId: employee.id },
      });

      if (existing && !refresh) {
        skipped += 1;
        continue;
      }

      const perfData = buildPerformance(employee);

      if (existing) {
        performanceRepo.merge(existing, perfData);
        await performanceRepo.save(existing);
        updated += 1;
      } else {
        const performance = performanceRepo.create({
          employeeId: employee.id,
          ...perfData,
        });
        await performanceRepo.save(performance);
        created += 1;
      }
    }

    console.log("[Seed] Employee performance seed complete");
    console.log(`[Seed] Created: ${created}, Updated: ${updated}, Skipped: ${skipped}`);
    process.exit(0);
  } catch (error) {
    console.error("[Seed] Failed to seed employee performance:", error);
    process.exit(1);
  }
};

seedEmployeePerformance();
