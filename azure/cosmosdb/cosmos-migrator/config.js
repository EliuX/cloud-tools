/**
 * Configuration management for Cosmos DB migration
 */

import dotenv from 'dotenv';

dotenv.config();

export class CosmosConfig {
    constructor(options = {}) {
        // Azure Cosmos DB (source)
        this.azureEndpoint = options.azureEndpoint || process.env.AZURE_COSMOS_ENDPOINT || '';
        this.azureKey = options.azureKey || process.env.AZURE_COSMOS_KEY || '';
        this.azureDatabaseName = options.azureDatabaseName || process.env.AZURE_COSMOS_DATABASE || '';
        
        // Local Emulator (destination)
        this.emulatorEndpoint = options.emulatorEndpoint || process.env.EMULATOR_ENDPOINT || 'https://localhost:8081';
        this.emulatorKey = options.emulatorKey || process.env.EMULATOR_KEY || 'C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==';
        this.emulatorDatabaseName = options.emulatorDatabaseName || process.env.EMULATOR_DATABASE || null;
        
        // Migration options
        this.includeData = options.includeData || process.env.INCLUDE_DATA === 'true' || false;
        this.includeScripts = options.includeScripts !== false; // Default to true
        this.batchSize = parseInt(options.batchSize || process.env.BATCH_SIZE || '100');
        this.maxRetries = parseInt(options.maxRetries || process.env.MAX_RETRIES || '3');
        this.overwrite = options.overwrite || process.env.OVERWRITE === 'true' || false;
        this.skipExisting = options.skipExisting || process.env.SKIP_EXISTING === 'true' || false;
        this.continueOnError = options.continueOnError !== false; // Default to true
        
        // Set emulator database name to azure database name if not specified
        if (!this.emulatorDatabaseName) {
            this.emulatorDatabaseName = this.azureDatabaseName;
        }
    }
    
    /**
     * Create configuration from environment variables
     */
    static fromEnv() {
        return new CosmosConfig();
    }
    
    /**
     * Validate configuration
     */
    validate() {
        const errors = [];
        
        if (!this.azureEndpoint) {
            errors.push('Azure Cosmos DB endpoint is required');
        }
        if (!this.azureKey) {
            errors.push('Azure Cosmos DB key is required');
        }
        if (!this.azureDatabaseName) {
            errors.push('Azure Cosmos DB database name is required');
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }
    
    /**
     * Get Azure Cosmos DB connection options
     */
    getAzureConnectionOptions() {
        return {
            endpoint: this.azureEndpoint,
            key: this.azureKey
        };
    }
    
    /**
     * Get emulator connection options
     */
    getEmulatorConnectionOptions() {
        return {
            endpoint: this.emulatorEndpoint,
            key: this.emulatorKey
        };
    }
}
