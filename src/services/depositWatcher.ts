/**
 * Deposit Watcher Service
 * Automatically monitors wallet balances and creates notifications when deposits are detected
 */

import { WalletController } from '../controllers/walletController';

export class DepositWatcher {
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;
  private checkInterval: number;

  /**
   * Create a new DepositWatcher
   * @param intervalMinutes - How often to check for deposits (in minutes)
   */
  constructor(intervalMinutes: number = 5) {
    this.checkInterval = intervalMinutes * 60 * 1000; // Convert to milliseconds
  }

  /**
   * Start the deposit watcher
   */
  start(): void {
    if (this.isRunning) {
      console.log('⚠️ Deposit watcher is already running');
      return;
    }

    console.log(`🔄 Starting deposit watcher (checking every ${this.checkInterval / 60000} minutes)`);
    
    // Run immediately on start
    this.checkDeposits();

    // Then run on interval
    this.intervalId = setInterval(() => {
      this.checkDeposits();
    }, this.checkInterval);

    this.isRunning = true;
    console.log('✅ Deposit watcher started successfully');
  }

  /**
   * Stop the deposit watcher
   */
  stop(): void {
    if (!this.isRunning || !this.intervalId) {
      console.log('⚠️ Deposit watcher is not running');
      return;
    }

    clearInterval(this.intervalId);
    this.intervalId = null;
    this.isRunning = false;
    console.log('⏹️ Deposit watcher stopped');
  }

  /**
   * Check for deposits (wrapper around WalletController.checkForDeposits)
   */
  private async checkDeposits(): Promise<void> {
    try {
      const startTime = Date.now();
      console.log(`🔍 [${new Date().toISOString()}] Checking for deposits...`);
      
      await WalletController.checkForDeposits();
      
      const duration = Date.now() - startTime;
      console.log(`✅ [${new Date().toISOString()}] Deposit check completed in ${duration}ms`);
    } catch (error) {
      console.error('❌ Deposit check failed:', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Get current status
   */
  getStatus(): { running: boolean; intervalMinutes: number } {
    return {
      running: this.isRunning,
      intervalMinutes: this.checkInterval / 60000,
    };
  }

  /**
   * Update check interval (will restart if running)
   * @param intervalMinutes - New interval in minutes
   */
  updateInterval(intervalMinutes: number): void {
    const wasRunning = this.isRunning;
    
    if (wasRunning) {
      this.stop();
    }
    
    this.checkInterval = intervalMinutes * 60 * 1000;
    
    if (wasRunning) {
      this.start();
    }
    
    console.log(`⚙️ Deposit check interval updated to ${intervalMinutes} minutes`);
  }
}

// Create singleton instance
const depositWatcher = new DepositWatcher(
  Number(process.env.DEPOSIT_CHECK_INTERVAL_MINUTES) || 5
);

export default depositWatcher;
