import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger";
import authRouter from "./routes/authRoute";
import walletRouter from "./routes/walletRoute";
import notificationRouter from "./routes/notificationRoute";
import splitPaymentRoutes from "./routes/splitPaymentRoute";
import paymentRouter from "./routes/paymentRoute";


const app = express();

app.use(cors());
app.use(express.json());

// Swagger UI setup
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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
app.use("/wallet", walletRouter);
app.use("/notification", notificationRouter);
app.use("/payment", paymentRouter);
app.use("/split-payment", splitPaymentRoutes);


export default app;