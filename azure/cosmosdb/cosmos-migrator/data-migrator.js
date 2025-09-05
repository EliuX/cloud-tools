/**
 * Data migration from Azure Cosmos DB to local emulator
 */

import { CosmosClient } from '@azure/cosmos';
import chalk from 'chalk';
import ora from 'ora';

export class DataMigrator {
    constructor(sourceEndpoint, sourceKey, targetEndpoint, targetKey, options = {}) {
        this.sourceClient = new CosmosClient({ endpoint: sourceEndpoint, key: sourceKey });
        this.targetClient = new CosmosClient({ endpoint: targetEndpoint, key: targetKey });
        
        // Migration options with defaults
        this.batchSize = options.batchSize || 100;
        this.maxRetries = options.maxRetries || 3;
        this.continueOnError = options.continueOnError !== false; // Default to true
        this.skipExisting = options.skipExisting || false;
        
        // Statistics tracking
        this.stats = {
            totalDocuments: 0,
            migratedDocuments: 0,
            failedDocuments: 0,
            skippedDocuments: 0,
            errors: []
        };
    }

    /**
     * Migrate all data from source database to target database
     */
    async migrateDatabase(sourceDatabaseName, targetDatabaseName = null) {
        targetDatabaseName = targetDatabaseName || sourceDatabaseName;
        
        console.log(chalk.blue(`\n🔄 Starting data migration from '${sourceDatabaseName}' to '${targetDatabaseName}'`));
        
        try {
            const sourceDatabase = this.sourceClient.database(sourceDatabaseName);
            const targetDatabase = this.targetClient.database(targetDatabaseName);
            
            // Get all containers in source database
            const { resources: containers } = await sourceDatabase.containers.readAll().fetchAll();
            
            console.log(chalk.cyan(`Found ${containers.length} containers to migrate`));
            
            for (const containerInfo of containers) {
                await this.migrateContainer(
                    sourceDatabase, 
                    targetDatabase, 
                    containerInfo.id
                );
            }
            
            this._printMigrationSummary();
            
            return {
                success: this.stats.failedDocuments === 0,
                stats: this.stats
            };
            
        } catch (error) {
            console.error(chalk.red(`❌ Database migration failed: ${error.message}`));
            if (!this.continueOnError) {
                throw error;
            }
            return {
                success: false,
                stats: this.stats,
                error: error.message
            };
        }
    }

    /**
     * Migrate data from a specific container
     */
    async migrateContainer(sourceDatabase, targetDatabase, containerName) {
        const spinner = ora(`Migrating container: ${containerName}`).start();
        
        try {
            const sourceContainer = sourceDatabase.container(containerName);
            const targetContainer = targetDatabase.container(containerName);
            
            // Verify target container exists
            try {
                await targetContainer.read();
            } catch (error) {
                if (error.code === 404) {
                    spinner.fail(`Target container '${containerName}' does not exist. Create schema first.`);
                    this.stats.errors.push(`Container '${containerName}' not found in target database`);
                    return;
                }
                throw error;
            }
            
            let continuationToken = null;
            let containerStats = { total: 0, migrated: 0, failed: 0, skipped: 0 };
            
            do {
                const queryOptions = {
                    maxItemCount: this.batchSize
                };
                
                if (continuationToken) {
                    queryOptions.continuationToken = continuationToken;
                }
                
                // Read batch of documents
                const { resources: documents, continuationToken: nextToken } = 
                    await sourceContainer.items.readAll(queryOptions).fetchNext();
                
                continuationToken = nextToken;
                
                if (documents.length > 0) {
                    const batchResult = await this._migrateBatch(
                        targetContainer, 
                        documents, 
                        containerName
                    );
                    
                    containerStats.total += documents.length;
                    containerStats.migrated += batchResult.migrated;
                    containerStats.failed += batchResult.failed;
                    containerStats.skipped += batchResult.skipped;
                    
                    spinner.text = `Migrating ${containerName}: ${containerStats.migrated}/${containerStats.total} documents`;
                }
                
            } while (continuationToken);
            
            // Update global stats
            this.stats.totalDocuments += containerStats.total;
            this.stats.migratedDocuments += containerStats.migrated;
            this.stats.failedDocuments += containerStats.failed;
            this.stats.skippedDocuments += containerStats.skipped;
            
            if (containerStats.failed > 0) {
                spinner.warn(`${containerName}: ${containerStats.migrated}/${containerStats.total} migrated, ${containerStats.failed} failed`);
            } else {
                spinner.succeed(`${containerName}: ${containerStats.migrated}/${containerStats.total} documents migrated`);
            }
            
        } catch (error) {
            spinner.fail(`Failed to migrate container '${containerName}': ${error.message}`);
            this.stats.errors.push(`Container '${containerName}': ${error.message}`);
            
            if (!this.continueOnError) {
                throw error;
            }
        }
    }

    /**
     * Migrate a batch of documents with error handling
     */
    async _migrateBatch(targetContainer, documents, containerName) {
        const batchStats = { migrated: 0, failed: 0, skipped: 0 };
        
        for (const document of documents) {
            try {
                // Check if document already exists (if skipExisting is enabled)
                if (this.skipExisting) {
                    try {
                        await targetContainer.item(document.id, document._partitionKey || document.id).read();
                        batchStats.skipped++;
                        continue;
                    } catch (error) {
                        if (error.code !== 404) {
                            throw error; // Re-throw if it's not a "not found" error
                        }
                        // Document doesn't exist, proceed with migration
                    }
                }
                
                // Remove system properties that shouldn't be migrated
                const cleanDocument = this._cleanDocument(document);
                
                // Attempt to create document with retries
                await this._createDocumentWithRetry(targetContainer, cleanDocument);
                batchStats.migrated++;
                
            } catch (error) {
                batchStats.failed++;
                const errorMsg = `Document ${document.id} in ${containerName}: ${error.message}`;
                this.stats.errors.push(errorMsg);
                
                if (!this.continueOnError) {
                    throw new Error(errorMsg);
                }
            }
        }
        
        return batchStats;
    }

    /**
     * Create document with retry logic
     */
    async _createDocumentWithRetry(container, document, retryCount = 0) {
        try {
            await container.items.create(document);
        } catch (error) {
            if (retryCount < this.maxRetries && this._isRetryableError(error)) {
                // Wait with exponential backoff
                const delay = Math.pow(2, retryCount) * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
                return this._createDocumentWithRetry(container, document, retryCount + 1);
            }
            throw error;
        }
    }

    /**
     * Check if error is retryable
     */
    _isRetryableError(error) {
        // Retry on rate limiting (429) or temporary server errors (5xx)
        return error.code === 429 || (error.code >= 500 && error.code < 600);
    }

    /**
     * Clean document by removing system properties
     */
    _cleanDocument(document) {
        const cleaned = { ...document };
        
        // Remove system properties that Cosmos DB manages
        delete cleaned._rid;
        delete cleaned._self;
        delete cleaned._etag;
        delete cleaned._attachments;
        delete cleaned._ts;
        
        return cleaned;
    }

    /**
     * Print migration summary
     */
    _printMigrationSummary() {
        console.log(chalk.blue('\n📊 Data Migration Summary:'));
        console.log(`Total Documents: ${this.stats.totalDocuments}`);
        console.log(chalk.green(`✅ Migrated: ${this.stats.migratedDocuments}`));
        
        if (this.stats.skippedDocuments > 0) {
            console.log(chalk.yellow(`⏭️  Skipped: ${this.stats.skippedDocuments}`));
        }
        
        if (this.stats.failedDocuments > 0) {
            console.log(chalk.red(`❌ Failed: ${this.stats.failedDocuments}`));
        }
        
        const successRate = this.stats.totalDocuments > 0 
            ? ((this.stats.migratedDocuments / this.stats.totalDocuments) * 100).toFixed(1)
            : 0;
        console.log(`Success Rate: ${successRate}%`);
        
        if (this.stats.errors.length > 0) {
            console.log(chalk.red('\n🚨 Errors encountered:'));
            this.stats.errors.slice(0, 10).forEach((error, index) => {
                console.log(chalk.red(`  ${index + 1}. ${error}`));
            });
            
            if (this.stats.errors.length > 10) {
                console.log(chalk.red(`  ... and ${this.stats.errors.length - 10} more errors`));
            }
        }
    }

    /**
     * Get migration statistics
     */
    getStats() {
        return { ...this.stats };
    }

    /**
     * Reset statistics
     */
    resetStats() {
        this.stats = {
            totalDocuments: 0,
            migratedDocuments: 0,
            failedDocuments: 0,
            skippedDocuments: 0,
            errors: []
        };
    }
}
