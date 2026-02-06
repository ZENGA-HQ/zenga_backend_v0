import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authMiddleware } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import createRateLimiter from "../middleware/rateLimiter";
import {
  forgotPasswordSchema,
  verifyResetTokenSchema,
  resetPasswordSchema,
  otpSchema,
} from "../validation/auth";

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Auth
 *     description: Authentication endpoints
 */

/**
 * @swagger
 * /auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register a new user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RegisterRequest'
 *     responses:
 *       201:
 *         description: User created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         $ref: '#/components/responses/BadRequest'
 */
// Register new user (strict rate limit: 5 reqs/min)
router.post(
  "/register",
  // createRateLimiter({ windowMs: 60 * 1000, max: 5, message: 'Too many registration attempts, please try again in a minute.' }),
  AuthController.register,
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login user and receive access and refresh tokens
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LoginRequest'
 *     responses:
 *       200:
 *         description: Logged in
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
// Login user (rate limit: 10 reqs/min)
router.post(
  "/login",
  // createRateLimiter({ windowMs: 60 * 1000, max: 10, message: 'Too many login attempts, please try again in a minute.' }),
  AuthController.login,
);

/**
 * @swagger
 * /auth/google:
 *   post:
 *     tags: [Auth]
 *     summary: Google sign-in check
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sign-in result
 */
// Google Sign-in check: returns tokens if user exists, otherwise { exists: false }
router.post("/google", AuthController.googleSignIn);

/**
 * @swagger
 * /auth/google/signup:
 *   post:
 *     tags: [Auth]
 *     summary: Create account using Google id_token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               id_token:
 *                 type: string
 *     responses:
 *       201:
 *         description: Account created
 */
// Google Sign-up: create account using Google id_token
router.post("/google/signup", AuthController.googleSignup);

/**
 * @swagger
 * /auth/verify-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Verify one-time password (OTP)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerifyOTPRequest'
 *     responses:
 *       200:
 *         description: OTP verified
 */
// Verify OTPvalidateRequest(otpSchema), 
router.post("/verify-otp", AuthController.verifyOTP);

/**
 * @swagger
 * /auth/resend-otp:
 *   post:
 *     tags: [Auth]
 *     summary: Resend verification OTP to user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP resent
 */
// Resend OTP
router.post("/resend-otp", AuthController.resendOTP);

/**
 * @swagger
 * /auth/refresh-token:
 *   post:
 *     tags: [Auth]
 *     summary: Refresh access token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: New tokens issued
 */
// Refresh token
router.post("/refresh-token", AuthController.refreshToken);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Request a password reset email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ForgotPasswordRequest'
 *     responses:
 *       200:
 *         description: Reset email sent
 */
// Forgot password
router.post(
  "/forgot-password",
  validateRequest(forgotPasswordSchema),
  AuthController.forgotPassword,
);

/**
 * @swagger
 * /auth/verify-reset-token:
 *   post:
 *     tags: [Auth]
 *     summary: Verify a password reset token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Token valid
 */
// Verify reset token
router.post(
  "/verify-reset-token",
  validateRequest(verifyResetTokenSchema),
  AuthController.verifyResetToken,
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     tags: [Auth]
 *     summary: Reset user password using token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResetPasswordRequest'
 *     responses:
 *       200:
 *         description: Password reset successful
 */
// Reset password
router.post(
  "/reset-password",
  validateRequest(resetPasswordSchema),
  AuthController.resetPassword,
);

/**
 * @swagger
 * /auth/profile:
 *   get:
 *     tags: [Auth]
 *     summary: Get current user profile
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 username:
 *                   type: string
 *                 firstName:
 *                   type: string
 *                 lastName:
 *                   type: string
 *                 phoneNumber:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
// Get user profile
router.get("/profile", authMiddleware, AuthController.getProfile);

/**
 * @swagger
 * /auth/profile:
 *   patch:
 *     tags: [Auth]
 *     summary: Update current user profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username (must be unique)
 *                 example: "john_doe"
 *               firstName:
 *                 type: string
 *                 example: "John"
 *               lastName:
 *                 type: string
 *                 example: "Doe"
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *               transactionPin:
 *                 type: string
 *                 description: Set or update 4-digit transaction PIN
 *                 example: "1234"
 *           examples:
 *             updateUsername:
 *               summary: Update username
 *               value:
 *                 username: "new_username"
 *             updateProfile:
 *               summary: Update full profile
 *               value:
 *                 username: "john_doe"
 *                 firstName: "John"
 *                 lastName: "Doe"
 *                 phoneNumber: "+1234567890"
 *             setTransactionPin:
 *               summary: Set transaction PIN
 *               value:
 *                 transactionPin: "1234"
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Profile updated successfully"
 *                 user:
 *                   type: object
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *                   examples:
 *                     - "Username already taken"
 *                     - "Transaction PIN must be 4 digits"
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
// Update user profile
router.patch("/profile", authMiddleware, AuthController.updateProfile);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Logout the current user
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
// Logout
router.post("/logout", authMiddleware, AuthController.logout);

/**
 * @swagger
 * /auth/logout-all:
 *   post:
 *     tags: [Auth]
 *     summary: Logout from all devices
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Logged out from all devices
 */
// Logout from all devices
router.post("/logout-all", authMiddleware, AuthController.logoutAll);

/**
 * @swagger
 * /auth/company/employees:
 *   get:
 *     tags: [Auth]
 *     summary: Get company employees (owner only)
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of employees
 */
// Get company employees (only for company owners)
router.get(
  "/company/employees",
  authMiddleware,
  AuthController.getCompanyEmployees,
);

/**
 * @swagger
 * /auth/company/employees/{employeeId}:
 *   put:
 *     tags: [Auth]
 *     summary: Update employee details (owner only)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: employeeId
 *         schema:
 *           type: string
 *         required: true
 *         description: Employee ID
 *     responses:
 *       200:
 *         description: Employee updated
 *       404:
 *         $ref: '#/components/responses/NotFound'
 */
// Update employee details (only for company owners)
router.put(
  "/company/employees/:employeeId",
  authMiddleware,
  AuthController.updateEmployee,
);

/**
 * @swagger
 * /auth/delete-user/{id}:
 *   delete:
 *     tags: [Auth]
 *     summary: Delete a user by ID
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *         description: User ID to delete
 *     responses:
 *       200:
 *         description: User deleted
 */
// Delete user by ID (expects :id param)
router.delete(
  "/delete-user/:id",
  authMiddleware,
  AuthController.deleteUserById,
);

export default router;
