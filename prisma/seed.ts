import { PrismaClient, Role, TaskStatus, TaskPriority } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as XLSX from 'xlsx';
import * as path from 'path';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface ExcelRow {
  'Employee ID': string | number;
  'Employee Name': string;
  'Role': string;
  'Contact Number': string | number;
  'Email ID': string;
  'Password': string | number;
}

async function main() {
  console.log('🌱 Starting database seeding pipeline for Nirmaan Water Tech...');

  const candidatePaths = [
    path.join(__dirname, '../database/Employee Data.xlsx'),
    path.join(process.cwd(), 'database/Employee Data.xlsx'),
    path.join(__dirname, 'Employee Data.xlsx'),
  ];
  const filePath = candidatePaths.find((p) => fs.existsSync(p));

  if (!filePath) {
    throw new Error(`Target dataset 'Employee Data.xlsx' could not be found.`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rawData = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

  console.log(`Parsed ${rawData.length} employee records from Excel.`);

  const userMap = new Map<string, string>();
  let primaryDirectorId: string | null = null;

  for (const row of rawData) {
    const empCode = String(row['Employee ID']).trim().toUpperCase();
    const fullName = String(row['Employee Name']).trim();
    const roleStr = String(row['Role']).trim().toLowerCase();
    const email = String(row['Email ID']).trim().toLowerCase();
    const rawPass = String(row['Password']).trim();
    const rawPhone = String(row['Contact Number']).replace(/\D/g, '');

    const isDirector = roleStr.includes('director') || empCode.startsWith('D');
    const role = isDirector ? Role.DIRECTOR : Role.EMPLOYEE;

    const nameTokens = fullName.toLowerCase().split(/\s+/);
    const username = nameTokens.length > 1 ? `${nameTokens[0]}.${nameTokens[nameTokens.length - 1]}` : nameTokens[0];
    const passwordHash = await bcrypt.hash(rawPass || 'Nirmaan@2026', 10);
    const formattedPhone = rawPhone.length === 10 ? `+91${rawPhone}` : `+${rawPhone}`;

    const user = await prisma.user.upsert({
      where: { employeeCode: empCode },
      update: {
        fullName,
        email,
        role,
        designation: String(row['Role']).trim(),
        phoneNumber: formattedPhone,
        isActive: true,
      },
      create: {
        employeeCode: empCode,
        username,
        email,
        fullName,
        designation: String(row['Role']).trim(),
        organization: 'Nirmaan Water Tech',
        passwordHash,
        role,
        phoneNumber: formattedPhone,
        isActive: true,
      },
    });

    userMap.set(empCode, user.id);
    if (isDirector && !primaryDirectorId) {
      primaryDirectorId = user.id;
    }
  }

  // Seed baseline tasks
  if (primaryDirectorId && userMap.size > 1) {
    const empCodes = Array.from(userMap.keys()).filter((code) => !code.startsWith('D'));
    const getEmpId = (idx: number) => userMap.get(empCodes[idx % empCodes.length])!;

    const initialTasks = [
      {
        title: 'Commercial RO Membrane Replacement & Chemical Flushing',
        description: 'Execute CIP acid wash on 5000 LPH RO unit at Client Site B. Verify permeate conductivity < 25 uS/cm.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.URGENT,
        dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        assignedToId: getEmpId(0),
        createdById: primaryDirectorId,
      },
      {
        title: 'Water Quality TDS Calibration & Online Sensor Testing',
        description: 'Perform 3-point pH & TDS sensor calibration. Log discrepancy between analog gauges and SCADA telemetry.',
        status: TaskStatus.BLOCKED,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() - 1 * 24 * 3600 * 1000), // Overdue & Blocked bottleneck
        assignedToId: getEmpId(1),
        createdById: primaryDirectorId,
      },
      {
        title: 'Client AMC Billing Reconciliation & Service Sign-off',
        description: 'Reconcile Q3 service visits against signed gate passes for industrial clients. Prepare invoice package.',
        status: TaskStatus.TO_DO,
        priority: TaskPriority.HIGH,
        dueDate: new Date(Date.now() + 4 * 24 * 3600 * 1000),
        assignedToId: getEmpId(2),
        createdById: primaryDirectorId,
      },
      {
        title: 'Industrial Water Softener Quotation for Pharma Plant',
        description: 'Draft technical bid for 10 m3/hr automatic softener plant including resin capacity calculations.',
        status: TaskStatus.IN_PROGRESS,
        priority: TaskPriority.MEDIUM,
        dueDate: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        assignedToId: getEmpId(3),
        createdById: primaryDirectorId,
      },
    ];

    for (const task of initialTasks) {
      await prisma.task.create({ data: task });
    }
    console.log(`✅ Seeded ${initialTasks.length} operational baseline tasks.`);
  }

  console.log('Seeding completed successfully.');
}

main()
  .catch((e) => {
    console.error('Seeding failure:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
