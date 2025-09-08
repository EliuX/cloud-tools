/**
 * Main migration orchestrator for Azure Storage
 */

import { BlobMigrator } from './blob-migrator.js';
import { QueueMigrator } from './queue-migrator.js';
import { StorageConfig } from './config.js';
import chalk from 'chalk';

export class StorageMigrator {
    constructor(config) {
        this.config = config;
        
        const sourceOptions = config.getSourceConnectionOptions();
        const destinationOptions = config.getDestinationConnectionOptions();
        
        // Initialize service migrators based on configuration
        if (config.includeBlobs) {
            this.blobMigrator = new BlobMigrator(sourceOptions, destinationOptions, config);
        }
        
        if (config.includeQueues) {
            this.queueMigrator = new QueueMigrator(sourceOptions, destinationOptions, config);
        }
        
        // TODO: Add other service migrators (Files, Tables) in future iterations
    }
    
    /**
     * Perform complete migration from source to destination storage account
     */
    async migrate() {
        console.log(chalk.blue('Starting Azure Storage Account migration...'));
        console.log(chalk.blue(`Source: ${this.config.getSourceAccountUrl()}`));
        console.log(chalk.blue(`Destination: ${this.config.getDestinationAccountUrl()}`));
        
        try {
            // Validate configuration
            this.config.validate();
            
            const results = {
                success: true,
                services: {},
                totalItems: 0,
                migratedItems: 0,
                skippedItems: 0,
                failedItems: 0,
                errors: [],
                startTime: new Date(),
                endTime: null,
                duration: null
            };
            
            // Migrate Blob Storage
            if (this.config.includeBlobs && this.blobMigrator) {
                console.log(chalk.yellow('\n📦 Migrating Blob Storage...'));
                const blobResults = await this.blobMigrator.migrateAllContainers();
                
                results.services.blobs = blobResults;
                results.totalItems += blobResults.totalBlobs;
                results.migratedItems += blobResults.migratedBlobs;
                results.skippedItems += blobResults.skippedBlobs;
                results.failedItems += blobResults.failedBlobs;
                results.errors.push(...blobResults.errors);
                
                console.log(chalk.green(`✅ Blob migration completed: ${blobResults.migratedBlobs}/${blobResults.totalBlobs} blobs migrated`));
            }
            
            // Migrate Queue Storage
            if (this.config.includeQueues && this.queueMigrator) {
                console.log(chalk.yellow('\n📬 Synchronizing Queue Storage...'));
                const queueResults = await this.queueMigrator.synchronizeQueues();
                
                results.services.queues = queueResults;
                results.totalItems += queueResults.totalSourceQueues;
                results.migratedItems += queueResults.createdQueues + queueResults.updatedQueues;
                results.skippedItems += queueResults.skippedQueues;
                results.failedItems += queueResults.errors.length;
                results.errors.push(...queueResults.errors);
                
                console.log(chalk.green(`✅ Queue synchronization completed: ${queueResults.createdQueues} created, ${queueResults.updatedQueues} updated, ${queueResults.deletedQueues} deleted`));
            }
            
            // TODO: Add File Share migration
            if (this.config.includeFiles) {
                console.log(chalk.yellow('\n📁 File Share migration not yet implemented'));
            }
            
            // TODO: Add Table migration
            if (this.config.includeTables) {
                console.log(chalk.yellow('\n📊 Table migration not yet implemented'));
            }
            
            results.endTime = new Date();
            results.duration = results.endTime - results.startTime;
            results.success = results.failedItems === 0 || this.config.continueOnError;
            
            this._printMigrationSummary(results);
            
            return results;
            
        } catch (error) {
            console.error(chalk.red(`\n❌ Migration failed: ${error.message}`));
            throw error;
        }
    }
    
    /**
     * List available containers and storage services
     */
    async listStorageServices() {
        console.log(chalk.blue('Listing storage services...'));
        
        try {
            this.config.validate();
            
            const services = {};
            
            // List Blob containers
            if (this.config.includeBlobs && this.blobMigrator) {
                console.log(chalk.yellow('\n📦 Blob Storage Containers:'));
                const containers = await this.blobMigrator.listContainers();
                services.containers = containers;
                
                if (containers.length === 0) {
                    console.log(chalk.gray('  No containers found'));
                } else {
                    containers.forEach((container, index) => {
                        console.log(`  ${index + 1}. ${container.name} (Last Modified: ${container.lastModified})`);
                    });
                }
            }
            
            // List Queues
            if (this.config.includeQueues && this.queueMigrator) {
                console.log(chalk.yellow('\n📬 Storage Queues:'));
                const queues = await this.queueMigrator.listSourceQueues();
                services.queues = queues;
                
                if (queues.length === 0) {
                    console.log(chalk.gray('  No queues found'));
                } else {
                    queues.forEach((queue, index) => {
                        console.log(`  ${index + 1}. ${queue.name} (Messages: ~${queue.approximateMessagesCount})`);
                    });
                }
            }
            
            // TODO: Add listing for other services
            
            return services;
            
        } catch (error) {
            console.error(chalk.red(`❌ Failed to list storage services: ${error.message}`));
            throw error;
        }
    }
    
    /**
     * Copy specific containers
     */
    async copyContainers(containerNames) {
        console.log(chalk.blue(`Copying specific containers: ${containerNames.join(', ')}`));
        
        try {
            this.config.validate();
            
            if (!this.config.includeBlobs || !this.blobMigrator) {
                throw new Error('Blob storage migration is not enabled');
            }
            
            const results = {
                totalContainers: containerNames.length,
                migratedContainers: 0,
                totalBlobs: 0,
                migratedBlobs: 0,
                skippedBlobs: 0,
                failedBlobs: 0,
                errors: []
            };
            
            for (const containerName of containerNames) {
                try {
                    console.log(chalk.yellow(`\nCopying container: ${containerName}`));
                    const containerResult = await this.blobMigrator.migrateContainer(containerName);
                    
                    results.migratedContainers++;
                    results.totalBlobs += containerResult.totalBlobs;
                    results.migratedBlobs += containerResult.migratedBlobs;
                    results.skippedBlobs += containerResult.skippedBlobs;
                    results.failedBlobs += containerResult.failedBlobs;
                    results.errors.push(...containerResult.errors);
                    
                    console.log(chalk.green(`✅ Container ${containerName} copied: ${containerResult.migratedBlobs}/${containerResult.totalBlobs} blobs`));
                    
                } catch (error) {
                    console.error(chalk.red(`❌ Failed to copy container ${containerName}: ${error.message}`));
                    results.errors.push(`Container ${containerName}: ${error.message}`);
                    
                    if (!this.config.continueOnError) {
                        throw error;
                    }
                }
            }
            
            console.log(chalk.blue(`\n📊 Copy Summary:`));
            console.log(chalk.blue(`Containers: ${results.migratedContainers}/${results.totalContainers}`));
            console.log(chalk.blue(`Blobs: ${results.migratedBlobs}/${results.totalBlobs}`));
            
            if (results.errors.length > 0) {
                console.log(chalk.yellow(`\n⚠️  Errors encountered:`));
                results.errors.forEach(error => console.log(chalk.red(`  ${error}`)));
            }
            
            return results;
            
        } catch (error) {
            console.error(chalk.red(`❌ Container copy failed: ${error.message}`));
            throw error;
        }
    }
    
    /**
     * Print migration summary
     */
    _printMigrationSummary(results) {
        console.log(chalk.blue('\n' + '='.repeat(60)));
        console.log(chalk.blue('📊 MIGRATION SUMMARY'));
        console.log(chalk.blue('='.repeat(60)));
        
        console.log(chalk.blue(`Status: ${results.success ? chalk.green('SUCCESS') : chalk.red('FAILED')}`));
        console.log(chalk.blue(`Duration: ${this._formatDuration(results.duration)}`));
        console.log(chalk.blue(`Total Items: ${results.totalItems}`));
        console.log(chalk.blue(`Migrated: ${chalk.green(results.migratedItems)}`));
        console.log(chalk.blue(`Skipped: ${chalk.yellow(results.skippedItems)}`));
        console.log(chalk.blue(`Failed: ${chalk.red(results.failedItems)}`));
        
        // Service-specific summaries
        if (results.services.blobs) {
            const blobs = results.services.blobs;
            console.log(chalk.blue('\n📦 Blob Storage:'));
            console.log(chalk.blue(`  Containers: ${blobs.migratedContainers}/${blobs.totalContainers}`));
            console.log(chalk.blue(`  Blobs: ${blobs.migratedBlobs}/${blobs.totalBlobs}`));
        }
        
        if (results.services.queues) {
            const queues = results.services.queues;
            console.log(chalk.blue('\n📬 Queue Storage:'));
            console.log(chalk.blue(`  Created: ${queues.createdQueues}`));
            console.log(chalk.blue(`  Updated: ${queues.updatedQueues}`));
            console.log(chalk.blue(`  Deleted: ${queues.deletedQueues}`));
            console.log(chalk.blue(`  Skipped: ${queues.skippedQueues}`));
        }
        
        if (results.errors.length > 0) {
            console.log(chalk.yellow('\n⚠️  Errors encountered:'));
            results.errors.slice(0, 10).forEach(error => {
                console.log(chalk.red(`  ${error}`));
            });
            
            if (results.errors.length > 10) {
                console.log(chalk.yellow(`  ... and ${results.errors.length - 10} more errors`));
            }
        }
        
        console.log(chalk.blue('='.repeat(60)));
    }
    
    /**
     * Format duration in human-readable format
     */
    _formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }
}
