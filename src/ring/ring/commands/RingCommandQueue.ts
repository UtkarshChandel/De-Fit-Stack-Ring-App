/**
 * Ring Command Queue
 * Manages command execution with proper timing and acknowledgment
 * Prevents command flooding that causes Ring disconnections
 */

export interface QueuedCommand {
  command: () => Promise<void>;
  name: string;
  priority?: number;
  timeout?: number;
}

export class RingCommandQueue {
  private queue: QueuedCommand[] = [];
  private processing = false;
  private lastCommandTime = 0;
  private MIN_INTERVAL = 500; // 500ms minimum between commands
  private DEFAULT_RESPONSE_WAIT = 200; // 200ms wait for response
  private commandResponseHandlers: Map<string, () => void> = new Map();
  private connectionCheckCallback?: () => boolean;
  
  /**
   * Enqueue a command for execution
   * @param command - The command function to execute
   * @param name - Name of the command for logging
   * @param priority - Optional priority (higher = executed first)
   */
  async enqueue(
    command: () => Promise<void>, 
    name: string, 
    priority: number = 0
  ): Promise<void> {
    console.log(`📋 Queuing command: ${name} (priority: ${priority})`);
    
    // Add to queue with priority
    const queuedCommand: QueuedCommand = { command, name, priority };
    
    if (priority > 0) {
      // Insert based on priority
      const insertIndex = this.queue.findIndex(cmd => (cmd.priority || 0) < priority);
      if (insertIndex === -1) {
        this.queue.push(queuedCommand);
      } else {
        this.queue.splice(insertIndex, 0, queuedCommand);
      }
    } else {
      this.queue.push(queuedCommand);
    }
    
    // Start processing if not already running
    if (!this.processing) {
      await this.process();
    }
  }
  
  /**
   * Process queued commands sequentially
   */
  private async process(): Promise<void> {
    if (this.processing) return;
    
    this.processing = true;
    console.log('🚀 Starting command queue processing');
    
    while (this.queue.length > 0) {
      // Check if still connected before processing next command
      if (this.connectionCheckCallback && !this.connectionCheckCallback()) {
        console.log('⚠️ Connection lost - stopping command queue');
        this.clear();
        break;
      }
      
      const queuedCommand = this.queue.shift()!;
      
      try {
        // Rate limiting - ensure minimum interval between commands
        const elapsed = Date.now() - this.lastCommandTime;
        if (elapsed < this.MIN_INTERVAL) {
          const waitTime = this.MIN_INTERVAL - elapsed;
          console.log(`⏳ Rate limiting: waiting ${waitTime}ms before next command`);
          await this.delay(waitTime);
        }
        
        console.log(`📤 Executing command: ${queuedCommand.name}`);
        
        // Execute the command
        await queuedCommand.command();
        this.lastCommandTime = Date.now();
        
        // Wait for response/acknowledgment
        await this.waitForResponse(queuedCommand.name, queuedCommand.timeout);
        
        console.log(`✅ Command completed: ${queuedCommand.name}`);
        
      } catch (error) {
        console.error(`❌ Command failed: ${queuedCommand.name}`, error);
        // Continue processing other commands even if one fails
      }
    }
    
    this.processing = false;
    console.log('✅ Command queue processing complete');
  }
  
  /**
   * Wait for command response/acknowledgment
   * @param commandName - Name of the command
   * @param timeout - Optional custom timeout
   */
  private async waitForResponse(
    commandName: string, 
    timeout: number = this.DEFAULT_RESPONSE_WAIT
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let responseReceived = false;
      
      // Set longer timeout for critical commands
      const actualTimeout = this.getCriticalCommandTimeout(commandName, timeout);
      
      // Check if there's a specific handler registered for this command
      const handler = this.commandResponseHandlers.get(commandName);
      
      if (handler) {
        console.log(`⏳ Waiting for ${commandName} response (timeout: ${actualTimeout}ms)...`);
        
        // Set up timeout for handler-based waiting
        const timeoutId = setTimeout(() => {
          if (!responseReceived) {
            console.log(`⚠️ Response timeout for ${commandName} after ${actualTimeout}ms`);
            this.commandResponseHandlers.delete(commandName);
            resolve(); // Still resolve to continue processing
          }
        }, actualTimeout);
        
        // Replace handler with one that clears timeout
        this.commandResponseHandlers.set(commandName, () => {
          responseReceived = true;
          clearTimeout(timeoutId);
          handler();
          this.commandResponseHandlers.delete(commandName);
          console.log(`✅ Response received for ${commandName}`);
          resolve();
        });
      } else {
        // Default: wait for Ring to process command with mandatory delay
        const waitTime = Math.max(timeout, 500); // Minimum 500ms between commands
        console.log(`⏳ Waiting ${waitTime}ms for ${commandName} to process...`);
        setTimeout(resolve, waitTime);
      }
    });
  }
  
  /**
   * Get timeout for critical commands that need longer response times
   */
  private getCriticalCommandTimeout(commandName: string, defaultTimeout: number): number {
    const criticalCommands: Record<string, number> = {
      'deviceInfo1': 3000,
      'deviceInfo2': 3000,
      'deviceBind': 2000,
      'timeSyn': 2000,
      'batteryDataAndState': 2000,
      'historicalNum': 5000,
      'historicalData': 10000,
    };
    
    return criticalCommands[commandName] || defaultTimeout;
  }
  
  /**
   * Register a response handler for a specific command
   * @param commandName - Name of the command
   * @param handler - Function to call when response is received
   */
  registerResponseHandler(commandName: string, handler: () => void): void {
    this.commandResponseHandlers.set(commandName, handler);
  }
  
  /**
   * Signal that a command response has been received
   * @param commandName - Name of the command that received a response
   */
  signalResponse(commandName: string): void {
    const handler = this.commandResponseHandlers.get(commandName);
    if (handler) {
      console.log(`📥 Response received for: ${commandName}`);
      handler();
    }
  }
  
  /**
   * Clear all pending commands
   */
  clear(): void {
    console.log('🧹 Clearing command queue');
    this.queue = [];
    this.processing = false;
    this.commandResponseHandlers.clear();
  }
  
  /**
   * Get current queue size
   */
  size(): number {
    return this.queue.length;
  }
  
  /**
   * Check if queue is currently processing
   */
  isProcessing(): boolean {
    return this.processing;
  }
  
  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Set a callback to check connection status
   */
  setConnectionCheck(callback: () => boolean): void {
    this.connectionCheckCallback = callback;
  }
}