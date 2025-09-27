/**
 * Ring Connection Coordinator
 * Single source of truth for Ring device connection management
 * Production-grade architecture with proper state management
 */

import { Platform } from 'react-native';
import { BLEDevice } from '../../types/ble';
import { SmartRingX1 } from '../../types/ring';
import { ringBleModule } from '../bluetooth/BleModule';
import { RingSDK } from '../sdk/ringSDK';
import { useRingStore, useRingTempStore } from '../state/ringStore';
import { DevicePersistenceService } from '../persistence/DevicePersistence';
import { ringService } from '../RingService';

/**
 * Connection state machine states
 */
export type ConnectionState = 
  | 'idle'
  | 'checking_permissions'
  | 'scanning'
  | 'connecting'
  | 'initializing'
  | 'connected'
  | 'disconnecting'
  | 'error';

/**
 * Connection state machine events
 */
export type ConnectionEvent = 
  | { type: 'START_SCAN' }
  | { type: 'STOP_SCAN' }
  | { type: 'DEVICE_DISCOVERED'; device: BLEDevice }
  | { type: 'CONNECT'; deviceId: string }
  | { type: 'CONNECTED'; deviceId: string }
  | { type: 'INITIALIZED' }
  | { type: 'DISCONNECT' }
  | { type: 'DISCONNECTED'; error?: Error }
  | { type: 'ERROR'; error: Error }
  | { type: 'RESET' };

/**
 * Connection state context
 */
export interface ConnectionContext {
  state: ConnectionState;
  isScanning: boolean;
  isConnecting: boolean;
  isConnected: boolean;
  discoveredDevices: Map<string, SmartRingX1>;
  connectedDevice: SmartRingX1 | null;
  error: Error | null;
  retryCount: number;
  maxRetries: number;
}

/**
 * Connection State Machine
 * Manages all valid state transitions for Ring connection
 */
export class ConnectionStateMachine {
  private state: ConnectionState = 'idle';
  private context: ConnectionContext;
  private listeners: Set<(context: ConnectionContext) => void> = new Set();

  constructor() {
    this.context = {
      state: 'idle',
      isScanning: false,
      isConnecting: false,
      isConnected: false,
      discoveredDevices: new Map(),
      connectedDevice: null,
      error: null,
      retryCount: 0,
      maxRetries: 3,
    };
  }

  /**
   * Process an event and transition states
   */
  public transition(event: ConnectionEvent): void {
    const prevState = this.state;
    const nextState = this.getNextState(this.state, event);

    if (nextState !== this.state) {
      console.log(`[FSM] ${prevState} -> ${nextState} (${event.type})`);
      this.state = nextState;
      this.updateContext(event);
      this.notifyListeners();
    }
  }

  /**
   * Determine next state based on current state and event
   */
  private getNextState(current: ConnectionState, event: ConnectionEvent): ConnectionState {
    switch (current) {
      case 'idle':
        if (event.type === 'START_SCAN') return 'checking_permissions';
        if (event.type === 'CONNECT') return 'connecting';
        break;

      case 'checking_permissions':
        if (event.type === 'ERROR') return 'error';
        if (event.type === 'START_SCAN') return 'scanning';
        break;

      case 'scanning':
        if (event.type === 'STOP_SCAN') return 'idle';
        if (event.type === 'CONNECT') return 'connecting';
        if (event.type === 'ERROR') return 'error';
        break;

      case 'connecting':
        if (event.type === 'CONNECTED') return 'initializing';
        if (event.type === 'ERROR') return 'error';
        if (event.type === 'DISCONNECTED') return 'idle';
        break;

      case 'initializing':
        if (event.type === 'INITIALIZED') return 'connected';
        if (event.type === 'ERROR') return 'error';
        if (event.type === 'DISCONNECTED') return 'idle';
        break;

      case 'connected':
        if (event.type === 'DISCONNECT') return 'disconnecting';
        if (event.type === 'DISCONNECTED') return 'idle';
        if (event.type === 'ERROR') return 'error';
        break;

      case 'disconnecting':
        if (event.type === 'DISCONNECTED') return 'idle';
        if (event.type === 'ERROR') return 'error';
        break;

      case 'error':
        if (event.type === 'RESET') return 'idle';
        if (event.type === 'START_SCAN') return 'checking_permissions';
        break;
    }

    return current; // No transition
  }

  /**
   * Update context based on event
   */
  private updateContext(event: ConnectionEvent): void {
    this.context.state = this.state;

    switch (event.type) {
      case 'START_SCAN':
        this.context.isScanning = true;
        this.context.error = null;
        break;

      case 'STOP_SCAN':
        this.context.isScanning = false;
        break;

      case 'DEVICE_DISCOVERED':
        const ringDevice = this.convertToSmartRing(event.device);
        this.context.discoveredDevices.set(event.device.id, ringDevice);
        break;

      case 'CONNECT':
        this.context.isConnecting = true;
        this.context.error = null;
        break;

      case 'CONNECTED':
        this.context.isConnecting = false;
        break;

      case 'INITIALIZED':
        this.context.isConnected = true;
        break;

      case 'DISCONNECT':
      case 'DISCONNECTED':
        this.context.isScanning = false;
        this.context.isConnecting = false;
        this.context.isConnected = false;
        this.context.connectedDevice = null;
        if (event.type === 'DISCONNECTED' && event.error) {
          this.context.error = event.error;
        }
        break;

      case 'ERROR':
        this.context.error = event.error;
        this.context.isScanning = false;
        this.context.isConnecting = false;
        break;

      case 'RESET':
        this.context.error = null;
        this.context.retryCount = 0;
        break;
    }
  }

  /**
   * Convert BLE device to SmartRing format
   */
  private convertToSmartRing(device: BLEDevice): SmartRingX1 {
    return {
      id: device.id,
      name: device.name || `Ring_${device.id.slice(-4)}`,
      color: 0, // Will be updated from device info
      size: 7,  // Will be updated from device info
      rssi: device.rssi,
      advertising: device.advertising,
    };
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (context: ConnectionContext) => void): () => void {
    this.listeners.add(listener);
    listener(this.context); // Initial state
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of state change
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => listener(this.context));
  }

  /**
   * Get current context
   */
  public getContext(): ConnectionContext {
    return { ...this.context };
  }

  /**
   * Check if transition is valid
   */
  public canTransition(event: ConnectionEvent): boolean {
    const nextState = this.getNextState(this.state, event);
    return nextState !== this.state;
  }
}

/**
 * Ring Connection Coordinator
 * Singleton coordinator for all Ring connection operations
 */
export class RingConnectionCoordinator {
  private static instance: RingConnectionCoordinator;
  private fsm: ConnectionStateMachine;
  private unsubscribers: Array<() => void> = [];
  private initializationPromise: Promise<void> | null = null;
  private scanTimeoutId: NodeJS.Timeout | null = null;

  private constructor() {
    this.fsm = new ConnectionStateMachine();
    this.setupBLEEventHandlers();
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RingConnectionCoordinator {
    if (!RingConnectionCoordinator.instance) {
      RingConnectionCoordinator.instance = new RingConnectionCoordinator();
    }
    return RingConnectionCoordinator.instance;
  }

  /**
   * Setup BLE event handlers with proper cleanup
   */
  private setupBLEEventHandlers(): void {
    // State change handler
    ringBleModule.setOnStateChange((state) => {
      console.log('[Coordinator] BLE State changed:', state);
      useRingStore.getState().setBleManagerState(state);
    });

    // Device discovery handler
    ringBleModule.setOnDiscovery((device) => {
      this.fsm.transition({ type: 'DEVICE_DISCOVERED', device });
    });

    // Connection handler
    ringBleModule.setOnConnection((deviceId) => {
      console.log('[Coordinator] Device connected:', deviceId);
      this.fsm.transition({ type: 'CONNECTED', deviceId });
      this.handlePostConnection(deviceId);
    });

    // Disconnection handler
    ringBleModule.setOnDisconnection((deviceId, error) => {
      console.log('[Coordinator] Device disconnected:', deviceId, error);
      this.fsm.transition({ 
        type: 'DISCONNECTED', 
        error: error ? new Error(error.message || 'Device disconnected') : undefined 
      });
    });

    // Scan stopped handler
    ringBleModule.setOnScanStopped(() => {
      console.log('[Coordinator] Scan stopped');
      this.fsm.transition({ type: 'STOP_SCAN' });
    });
  }

  /**
   * Handle post-connection initialization
   */
  private async handlePostConnection(deviceId: string): Promise<void> {
    // Prevent multiple simultaneous initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('[Coordinator] Initializing connected device...');
        
        // Let RingService handle the initialization
        await ringService.initializeDevice();
        
        this.fsm.transition({ type: 'INITIALIZED' });
        
        // Store device info for persistence
        const context = this.fsm.getContext();
        if (context.connectedDevice) {
          await DevicePersistenceService.storeDevicePairing(
            context.connectedDevice,
            useRingStore.getState().deviceInfo1,
            useRingStore.getState().deviceInfo2
          );
        }
      } catch (error) {
        console.error('[Coordinator] Initialization failed:', error);
        this.fsm.transition({ 
          type: 'ERROR', 
          error: error instanceof Error ? error : new Error('Initialization failed') 
        });
      } finally {
        this.initializationPromise = null;
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Start scanning for Ring devices
   */
  public async startScan(timeout: number = 10000): Promise<void> {
    const context = this.fsm.getContext();
    
    if (context.isScanning) {
      console.warn('[Coordinator] Scan already in progress');
      return;
    }

    if (!this.fsm.canTransition({ type: 'START_SCAN' })) {
      throw new Error(`Cannot start scan in state: ${context.state}`);
    }

    try {
      this.fsm.transition({ type: 'START_SCAN' });
      
      // Check permissions
      const hasPermissions = await this.checkAndRequestPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions not granted');
      }

      // Clear previous discoveries
      const newContext = this.fsm.getContext();
      newContext.discoveredDevices.clear();

      // Start BLE scan
      await ringBleModule.startScan({ timeout, allowDuplicates: false });

      // Set scan timeout
      this.scanTimeoutId = setTimeout(() => {
        this.stopScan();
      }, timeout);

    } catch (error) {
      console.error('[Coordinator] Scan failed:', error);
      this.fsm.transition({ 
        type: 'ERROR', 
        error: error instanceof Error ? error : new Error('Scan failed') 
      });
      throw error;
    }
  }

  /**
   * Stop scanning
   */
  public async stopScan(): Promise<void> {
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }

    try {
      await ringBleModule.stopScan();
      this.fsm.transition({ type: 'STOP_SCAN' });
    } catch (error) {
      console.error('[Coordinator] Failed to stop scan:', error);
    }
  }

  /**
   * Connect to a Ring device
   */
  public async connect(deviceId: string): Promise<void> {
    const context = this.fsm.getContext();
    
    if (!this.fsm.canTransition({ type: 'CONNECT', deviceId })) {
      throw new Error(`Cannot connect in state: ${context.state}`);
    }

    try {
      this.fsm.transition({ type: 'CONNECT', deviceId });
      
      // Stop any ongoing scan
      if (context.isScanning) {
        await this.stopScan();
      }

      // Use RingService for connection (it handles retries and OEM verification)
      const success = await ringService.connectToRing(deviceId);
      
      if (!success) {
        throw new Error('Connection failed');
      }

    } catch (error) {
      console.error('[Coordinator] Connection failed:', error);
      this.fsm.transition({ 
        type: 'ERROR', 
        error: error instanceof Error ? error : new Error('Connection failed') 
      });
      throw error;
    }
  }

  /**
   * Disconnect from current device
   */
  public async disconnect(): Promise<void> {
    const context = this.fsm.getContext();
    
    if (!context.isConnected) {
      console.warn('[Coordinator] No device connected');
      return;
    }

    try {
      this.fsm.transition({ type: 'DISCONNECT' });
      await ringService.disconnect();
    } catch (error) {
      console.error('[Coordinator] Disconnect failed:', error);
      this.fsm.transition({ 
        type: 'ERROR', 
        error: error instanceof Error ? error : new Error('Disconnect failed') 
      });
      throw error;
    }
  }

  /**
   * Auto-connect to stored device
   */
  public async autoConnect(): Promise<boolean> {
    try {
      return await ringService.autoConnectStoredDevice();
    } catch (error) {
      console.error('[Coordinator] Auto-connect failed:', error);
      return false;
    }
  }

  /**
   * Check and request BLE permissions
   */
  private async checkAndRequestPermissions(): Promise<boolean> {
    // This would use the permission logic from ringSetup
    // For now, returning true as permissions are handled elsewhere
    return true;
  }

  /**
   * Subscribe to state changes
   */
  public subscribe(listener: (context: ConnectionContext) => void): () => void {
    return this.fsm.subscribe(listener);
  }

  /**
   * Get current state
   */
  public getState(): ConnectionContext {
    return this.fsm.getContext();
  }

  /**
   * Cleanup resources
   */
  public cleanup(): void {
    this.unsubscribers.forEach(unsub => unsub());
    this.unsubscribers = [];
    
    if (this.scanTimeoutId) {
      clearTimeout(this.scanTimeoutId);
      this.scanTimeoutId = null;
    }
  }
}