import { Request, Response } from "express";
import { AppDataSource } from "../config/database";
import { Company } from "../entities/Company";
import { AuthRequest } from "../types";

export class CompanyController {
  /**
   * Get all companies
   */
  static async getAllCompanies(req: Request, res: Response): Promise<void> {
    try {
      const companyRepo = AppDataSource.getRepository(Company);
      const companies = await companyRepo.find({
        relations: ["users", "employees"],
        take: 50,
      });
      res.status(200).json({
        success: true,
        data: companies,
        count: companies.length,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * Get company by ID
   */
  static async getCompanyById(req: Request, res: Response): Promise<void> {
    try {
      const idParam = req.params.id;
      const id: string = Array.isArray(idParam) ? idParam[0] : idParam;
      const companyRepo = AppDataSource.getRepository(Company);
      const company = await companyRepo.findOne({
        where: { id },
        relations: ["users", "employees"],
      });

      if (!company) {
        res.status(404).json({ success: false, error: "Company not found" });
        return;
      }

      res.status(200).json({ success: true, data: company });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * Get company by code
   */
  static async getCompanyByCode(req: Request, res: Response): Promise<void> {
    try {
      const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
      const companyRepo = AppDataSource.getRepository(Company);
      const company = await companyRepo.findOne({
        where: { companyCode: code as string },
        relations: ["users", "employees"],
      });

      if (!company) {
        res
          .status(404)
          .json({ success: false, error: "Company with this code not found" });
        return;
      }

      res.status(200).json({ success: true, data: company });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * Create new company
   */
  static async createCompany(req: Request, res: Response): Promise<void> {
    try {
      const { companyName, companyEmail } = req.body;

      if (!companyName) {
        res
          .status(400)
          .json({ success: false, error: "Company name is required" });
        return;
      }

      const companyRepo = AppDataSource.getRepository(Company);

      // Check if email already exists
      if (companyEmail) {
        const existing = await companyRepo.findOne({
          where: { companyEmail },
        });
        if (existing) {
          res.status(409).json({
            success: false,
            error: "Company email already registered",
          });
          return;
        }
      }

      const company = companyRepo.create({
        companyName,
        companyEmail: companyEmail || null,
        isActive: true,
      });

      await companyRepo.save(company);

      res.status(201).json({
        success: true,
        message: "Company created successfully",
        data: company,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * Update company
   */
  static async updateCompany(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const { companyName, companyEmail, isActive } = req.body;

      const companyRepo = AppDataSource.getRepository(Company);
      const company = await companyRepo.findOne({ where: { id: id as string } });

      if (!company) {
        res.status(404).json({ success: false, error: "Company not found" });
        return;
      }

      if (companyName) company.companyName = companyName;
      if (companyEmail !== undefined) company.companyEmail = companyEmail;
      if (isActive !== undefined) company.isActive = isActive;

      await companyRepo.save(company);

      res.status(200).json({
        success: true,
        message: "Company updated successfully",
        data: company,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * Delete company
   */
  static async deleteCompany(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const companyRepo = AppDataSource.getRepository(Company);
      const company = await companyRepo.findOne({ where: { id: id as string } });

      if (!company) {
        res.status(404).json({ success: false, error: "Company not found" });
        return;
      }

      await companyRepo.remove(company);

      res.status(200).json({
        success: true,
        message: "Company deleted successfully",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }

  /**
   * Get company statistics
   */
  static async getCompanyStats(req: Request, res: Response): Promise<void> {
    try {
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

      const companyRepo = AppDataSource.getRepository(Company);
      const company = await companyRepo.findOne({
        where: { id: id as string },
        relations: ["users", "employees"],
      });

      if (!company) {
        res.status(404).json({ success: false, error: "Company not found" });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: company.id,
          companyName: company.companyName,
          companyCode: company.companyCode,
          usersCount: company.users?.length || 0,
          employeesCount: company.employees?.length || 0,
          isActive: company.isActive,
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
        },
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : "Internal server error",
      });
    }
  }
}
