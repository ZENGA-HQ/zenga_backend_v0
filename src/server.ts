import "reflect-metadata";
import dotenv from "dotenv";
import { connectDB } from "./config/database";
import app from "./app";

// Load environment variables
dotenv.config();

const PORT = Number(process.env.PORT) || 5500;
console.log(`Using PORT=${PORT}`);

connectDB().then(() => {
       app.listen(PORT, () => {
              console.log(`Server is running on port ${PORT}`);
              // Start automatic deposit monitor (calls WalletController.checkForDeposits periodically)
       });
});
