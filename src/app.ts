import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import { swaggerBasicAuth } from "./middleware/swaggerBasicAuth";
import authRouter from "./routes/authRoute";
import userRouter from "./routes/userRoute";
import walletRouter from "./routes/walletRoute";
import notificationRouter from "./routes/notificationRoute";
import splitPaymentRoutes from "./routes/splitPaymentRoute";
import paymentRouter from "./routes/paymentRoute";
import pmRouter from "./routes/pmRoute";
import companyRouter from "./routes/companyRoute";


const app = express();

// Enhanced CORS configuration for development and Swagger
app.use(cors({
  origin: process.env.NODE_ENV === "production" 
    ? process.env.CORS_ORIGIN || "http://localhost:5500"
    : true, // Allow all origins in development
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

// Swagger UI (auth disabled in development for easier access)
const swaggerAuth = process.env.NODE_ENV === "production" ? swaggerBasicAuth : [];
app.use("/api-docs", swaggerAuth, swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/**
 * @swagger
 * /:
 *   get:
 *     summary: Welcome message
 *     description: Returns a welcome message to verify the server is running.
 *     responses:
 *       200:
 *         description: Server is running
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: Zenga Backend Server is running!
 */
app.get("/", (req, res) => {
       res.send("Zenga Backend Server is running!");
});

// Health check endpoint
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check
 *     description: Returns the status and timestamp of the server.
 *     responses:
 *       200:
 *         description: Server is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: ok }
 *                 timestamp: { type: string, format: date-time }
 */
app.get("/health", (req, res) => {
       res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/auth", authRouter);
app.use("/user", userRouter);
app.use("/wallet", walletRouter);
app.use("/notification", notificationRouter);
app.use("/payment", paymentRouter);
app.use("/split-payment", splitPaymentRoutes);
app.use("/pm", pmRouter);
app.use("/company", companyRouter);


export default app;