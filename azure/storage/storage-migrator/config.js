/**
 * Configuration management for Azure Storage migration
 */

import dotenv from 'dotenv';

dotenv.config();

export class StorageConfig {
    constructor(options = {}) {
        // Source Storage Account
        this.sourceConnectionString = options.sourceConnectionString || process.env.SOURCE_STORAGE_CONNECTION_STRING || '';
        this.sourceAccountName = options.sourceAccountName || process.env.SOURCE_STORAGE_ACCOUNT_NAME || '';
        this.sourceAccountKey = options.sourceAccountKey || process.env.SOURCE_STORAGE_ACCOUNT_KEY || '';
        this.sourceSasToken = options.sourceSasToken || process.env.SOURCE_STORAGE_SAS_TOKEN || '';
        
        // Destination Storage Account
        this.destinationConnectionString = options.destinationConnectionString || process.env.DESTINATION_STORAGE_CONNECTION_STRING || '';
        this.destinationAccountName = options.destinationAccountName || process.env.DESTINATION_STORAGE_ACCOUNT_NAME || '';
        this.destinationAccountKey = options.destinationAccountKey || process.env.DESTINATION_STORAGE_ACCOUNT_KEY || '';
        this.destinationSasToken = options.destinationSasToken || process.env.DESTINATION_STORAGE_SAS_TOKEN || '';
        
        // Migration options
        this.includeBlobs = options.includeBlobs !== false; // Default to true
        this.includeFiles = options.includeFiles || process.env.INCLUDE_FILES === 'true' || false;
        this.includeQueues = options.includeQueues || process.env.INCLUDE_QUEUES === 'true' || false;
        this.includeTables = options.includeTables || process.env.INCLUDE_TABLES === 'true' || false;
        
        // Performance options
        this.batchSize = parseInt(options.batchSize || process.env.BATCH_SIZE || '10');
        this.maxConcurrency = parseInt(options.maxConcurrency || process.env.MAX_CONCURRENCY || '5');
        this.maxRetries = parseInt(options.maxRetries || process.env.MAX_RETRIES || '3');
        
        // Behavior options
        this.overwrite = options.overwrite || process.env.OVERWRITE === 'true' || false;
        this.skipExisting = options.skipExisting || process.env.SKIP_EXISTING === 'true' || false;
        this.continueOnError = options.continueOnError !== false; // Default to true
        this.preserveMetadata = options.preserveMetadata !== false; // Default to true
        this.preserveAccessTier = options.preserveAccessTier !== false; // Default to true
        
        // Filter options
        this.containerFilter = options.containerFilter || process.env.CONTAINER_FILTER || '';
        this.blobPrefix = options.blobPrefix || process.env.BLOB_PREFIX || '';
        this.excludePatterns = options.excludePatterns || (process.env.EXCLUDE_PATTERNS ? process.env.EXCLUDE_PATTERNS.split(',') : []);
    }
    
    /**
     * Create configuration from environment variables
     */
    static fromEnv() {
        return new StorageConfig();
    }
    
    /**
     * Validate configuration
     */
    validate() {
        const errors = [];
        
        // Validate source storage account
        if (!this.sourceConnectionString && (!this.sourceAccountName || (!this.sourceAccountKey && !this.sourceSasToken))) {
            errors.push('Source storage account credentials are required (connection string OR account name + key/SAS token)');
        }
        
        // Validate destination storage account
        if (!this.destinationConnectionString && (!this.destinationAccountName || (!this.destinationAccountKey && !this.destinationSasToken))) {
            errors.push('Destination storage account credentials are required (connection string OR account name + key/SAS token)');
        }
        
        // Validate at least one service type is selected
        if (!this.includeBlobs && !this.includeFiles && !this.includeQueues && !this.includeTables) {
            errors.push('At least one service type must be selected (blobs, files, queues, or tables)');
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
        }
    }
    
    /**
     * Get source storage connection options
     */
    getSourceConnectionOptions() {
        if (this.sourceConnectionString) {
            return { connectionString: this.sourceConnectionString };
        }
        
        return {
            accountName: this.sourceAccountName,
            accountKey: this.sourceAccountKey,
            sasToken: this.sourceSasToken
        };
    }
    
    /**
     * Get destination storage connection options
     */
    getDestinationConnectionOptions() {
        if (this.destinationConnectionString) {
            return { connectionString: this.destinationConnectionString };
        }
        
        return {
            accountName: this.destinationAccountName,
            accountKey: this.destinationAccountKey,
            sasToken: this.destinationSasToken
        };
    }
    
    /**
     * Get source storage account URL
     */
    getSourceAccountUrl() {
        if (this.sourceConnectionString) {
            const match = this.sourceConnectionString.match(/AccountName=([^;]+)/);
            return match ? `https://${match[1]}.blob.core.windows.net` : null;
        }
        return this.sourceAccountName ? `https://${this.sourceAccountName}.blob.core.windows.net` : null;
    }
    
    /**
     * Get destination storage account URL
     */
    getDestinationAccountUrl() {
        if (this.destinationConnectionString) {
            const match = this.destinationConnectionString.match(/AccountName=([^;]+)/);
            return match ? `https://${match[1]}.blob.core.windows.net` : null;
        }
        return this.destinationAccountName ? `https://${this.destinationAccountName}.blob.core.windows.net` : null;
    }
}
