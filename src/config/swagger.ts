import swaggerJSDoc from "swagger-jsdoc";
import dotenv from "dotenv";

// Load environment variables to get the PORT
dotenv.config();

const PORT = process.env.PORT || 5500;

const options: swaggerJSDoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Zenga Backend API",
      version: "1.0.0",
      description: "API documentation for Zenga Backend services. You can test routes directly here.",
    },
    servers: [
      {
        url: "http://localhost:5501",
        description: "Development Server (Docker)",
      },
      {
        url: `http://localhost:${PORT}`,
        description: "Production Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        RegisterRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: "user@example.com" },
            password: { type: "string", example: "strongP@ssw0rd" },
            name: { type: "string", example: "Jane Doe" }
          },
          required: ["email", "password"]
        },
        LoginRequest: {
          type: "object",
          properties: {
            email: { type: "string", example: "user@example.com" },
            password: { type: "string", example: "strongP@ssw0rd" }
          },
          required: ["email", "password"]
        },
        AuthResponse: {
          type: "object",
          properties: {
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
            user: { type: "object" }
          }
        },
        ForgotPasswordRequest: {
          type: "object",
          properties: { email: { type: "string", example: "user@example.com" } },
          required: ["email"]
        },
        ResetPasswordRequest: {
          type: "object",
          properties: { token: { type: "string" }, password: { type: "string" } },
          required: ["token", "password"]
        },
        VerifyOTPRequest: {
          type: "object",
          properties: { email: { type: "string" }, code: { type: "string" } },
          required: ["email", "code"]
        },
        GenericMessage: {
          type: "object",
          properties: { message: { type: "string" } }
        }
      },
      responses: {
        Unauthorized: { description: "Unauthorized" },
        BadRequest: { description: "Bad request" },
        NotFound: { description: "Resource not found" },
        InternalError: { description: "Internal server error" }
      }
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/app.ts"], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;