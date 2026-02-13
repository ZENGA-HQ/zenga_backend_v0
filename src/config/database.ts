import dotenv from "dotenv";
dotenv.config();

import "reflect-metadata";
import { DataSource } from "typeorm";
import { User } from "../entities/User";
import { Company } from "../entities/Company";
import { UserAddress } from "../entities/UserAddress";
import { KYCDocument } from "../entities/KYCDocument";
import { RefreshToken } from "../entities/RefreshToken";
import { Employee } from "../entities/Employee";
import { Notification } from "../entities/Notification";
import { SplitPayment } from "../entities/SplitPayment";
import { SplitPaymentExecution } from "../entities/SplitPaymentExecution";
import { SplitPaymentExecutionResult } from "../entities/SplitPaymentExecutionResult";
import { SplitPaymentRecipient } from "../entities/SplitPaymentRecipient";
import { AirtimePurchase } from "../entities/AirtimePurchase";
import { DataPurchase } from "../entities/DataPurchase";
import { ElectricityPurchase } from "../entities/ElectricityPurchase";
import { FiatTransaction } from "../entities/FiatTransaction";


export const AppDataSource = new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL || "",
  synchronize: true, // Auto-create tables from entities
  logging: ["error"],
  entities: [
    User,
    Company,
    UserAddress,
    KYCDocument,
    RefreshToken,
    Employee,
    Notification,
    SplitPayment,
    SplitPaymentExecution,
    SplitPaymentExecutionResult,
    SplitPaymentRecipient,
    AirtimePurchase,
    DataPurchase,
    ElectricityPurchase,
    FiatTransaction,
  ],
  migrations: ["src/migrations/*.ts"],
  subscribers: ["src/subscribers/*.ts"],
  // ssl: { rejectUnauthorized: false },
});

export const connectDB = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log("PostgreSQL Connected successfully");

    // Debug: Check if AirtimePurchase is registered
    const entityNames = AppDataSource.entityMetadatas.map((meta) => meta.name);
    // console.log('Registered entities:', entityNames);
  } catch (error) {
    console.error("Database connection failed:", error);
    process.exit(1);
  }
};
