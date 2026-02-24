import { Router } from "express";
import { CompanyController } from "../controllers/companyController";

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Company
 *     description: Company management endpoints for testing
 */

/**
 * @swagger
 * /company:
 *   get:
 *     tags: [Company]
 *     summary: Get all companies
 *     description: Retrieve a list of all companies in the system (limit 50)
 *     responses:
 *       200:
 *         description: List of companies retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: number
 *                   example: 5
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       companyName:
 *                         type: string
 *                       companyEmail:
 *                         type: string
 *                       companyCode:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *                       usersCount:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 */
router.get("/", CompanyController.getAllCompanies);

/**
 * @swagger
 * /company:
 *   post:
 *     tags: [Company]
 *     summary: Create a new company
 *     description: Create a new company for testing purposes
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyName]
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: "Acme Corporation"
 *               companyEmail:
 *                 type: string
 *                 example: "company@acme.com"
 *     responses:
 *       201:
 *         description: Company created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     companyName:
 *                       type: string
 *                     companyCode:
 *                       type: string
 *       400:
 *         description: Missing required fields
 *       409:
 *         description: Company email already exists
 *       500:
 *         description: Server error
 */
router.post("/", CompanyController.createCompany);

/**
 * @swagger
 * /company/{id}:
 *   get:
 *     tags: [Company]
 *     summary: Get company by ID
 *     description: Retrieve a specific company by its ID
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Company retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
router.get("/:id", CompanyController.getCompanyById);

/**
 * @swagger
 * /company/code/{code}:
 *   get:
 *     tags: [Company]
 *     summary: Get company by code
 *     description: Retrieve a company using its unique company code
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         example: "ABC12345"
 *     responses:
 *       200:
 *         description: Company retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
router.get("/code/:code", CompanyController.getCompanyByCode);

/**
 * @swagger
 * /company/{id}:
 *   put:
 *     tags: [Company]
 *     summary: Update company
 *     description: Update company information
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               companyName:
 *                 type: string
 *                 example: "Updated Company Name"
 *               companyEmail:
 *                 type: string
 *                 example: "updated@company.com"
 *               isActive:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Company updated successfully
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
router.put("/:id", CompanyController.updateCompany);

/**
 * @swagger
 * /company/{id}:
 *   delete:
 *     tags: [Company]
 *     summary: Delete company
 *     description: Remove a company from the system
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company deleted successfully
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
router.delete("/:id", CompanyController.deleteCompany);

/**
 * @swagger
 * /company/{id}/stats:
 *   get:
 *     tags: [Company]
 *     summary: Get company statistics
 *     description: Get statistics for a company including user and employee counts
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Company statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     companyName:
 *                       type: string
 *                     companyCode:
 *                       type: string
 *                     usersCount:
 *                       type: number
 *                     employeesCount:
 *                       type: number
 *                     isActive:
 *                       type: boolean
 *       404:
 *         description: Company not found
 *       500:
 *         description: Server error
 */
router.get("/:id/stats", CompanyController.getCompanyStats);

export default router;
