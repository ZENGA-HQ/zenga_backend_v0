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
        url: `http://localhost:${PORT}`,
        description: "Development Server (Docker)",
      },
      {
        url: "http://0.0.0.0:5500",
        description: "Docker Container",
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
            name: { type: "string", example: "Jane Doe" },
            userType: { 
              type: "string", 
              enum: ["individual", "company", "employee"],
              example: "individual",
              description: "Type of user: 'individual' for regular users, 'company' for company admins, 'employee' for employees joining a company"
            },
            companyName: { 
              type: "string", 
              example: "Acme Corporation",
              description: "Required if userType is 'company'"
            },
            companyCode: { 
              type: "string", 
              example: "ABC12345",
              description: "Required if userType is 'employee'. Use the company code provided by your company admin."
            }
          },
          required: ["email", "password"],
          examples: {
            individual: {
              value: {
                email: "john@example.com",
                password: "SecureP@ss123",
                name: "John Doe",
                userType: "individual"
              }
            },
            company: {
              value: {
                email: "admin@company.com",
                password: "SecureP@ss123",
                name: "Admin User",
                userType: "company",
                companyName: "Tech Solutions Ltd"
              }
            },
            employee: {
              value: {
                email: "employee@company.com",
                password: "SecureP@ss123",
                name: "Employee Name",
                userType: "employee",
                companyCode: "ABC12345"
              }
            }
          }
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
  apis: process.env.NODE_ENV === "production" 
    ? ["./dist/routes/*.js", "./dist/app.js"] 
    : ["./src/routes/*.ts", "./src/app.ts"], // Path to the API docs
};

const swaggerSpec = swaggerJSDoc(options);

export default swaggerSpec;