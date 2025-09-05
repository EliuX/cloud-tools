/**
 * Azure Blob Storage migration functionality
 */

import { BlobServiceClient } from '@azure/storage-blob';
import chalk from 'chalk';
import ProgressBar from 'progress';

export class BlobMigrator {
    constructor(sourceOptions, destinationOptions, config) {
        this.config = config;
        
        // Initialize source client
        if (sourceOptions.connectionString) {
            this.sourceClient = BlobServiceClient.fromConnectionString(sourceOptions.connectionString);
        } else {
            const sourceUrl = `https://${sourceOptions.accountName}.blob.core.windows.net`;
            if (sourceOptions.accountKey) {
                this.sourceClient = new BlobServiceClient(sourceUrl, {
                    accountName: sourceOptions.accountName,
                    accountKey: sourceOptions.accountKey
                });
            } else if (sourceOptions.sasToken) {
                this.sourceClient = new BlobServiceClient(`${sourceUrl}?${sourceOptions.sasToken}`);
            }
        }
        
        // Initialize destination client
        if (destinationOptions.connectionString) {
            this.destinationClient = BlobServiceClient.fromConnectionString(destinationOptions.connectionString);
        } else {
            const destinationUrl = `https://${destinationOptions.accountName}.blob.core.windows.net`;
            if (destinationOptions.accountKey) {
                this.destinationClient = new BlobServiceClient(destinationUrl, {
                    accountName: destinationOptions.accountName,
                    accountKey: destinationOptions.accountKey
                });
            } else if (destinationOptions.sasToken) {
                this.destinationClient = new BlobServiceClient(`${destinationUrl}?${destinationOptions.sasToken}`);
            }
        }
    }
    
    /**
     * List all containers in source storage account
     */
    async listContainers() {
        const containers = [];
        
        try {
            for await (const container of this.sourceClient.listContainers()) {
                containers.push({
                    name: container.name,
                    lastModified: container.properties.lastModified,
                    publicAccess: container.properties.publicAccess,
                    hasImmutabilityPolicy: container.properties.hasImmutabilityPolicy,
                    hasLegalHold: container.properties.hasLegalHold
                });
            }
            
            return containers;
        } catch (error) {
            throw new Error(`Failed to list containers: ${error.message}`);
        }
    }
    
    /**
     * Migrate all containers and blobs
     */
    async migrateAllContainers() {
        console.log(chalk.blue('Starting blob storage migration...'));
        
        const containers = await this.listContainers();
        const filteredContainers = this._filterContainers(containers);
        
        console.log(chalk.blue(`Found ${containers.length} containers, migrating ${filteredContainers.length} containers`));
        
        const results = {
            totalContainers: filteredContainers.length,
            migratedContainers: 0,
            totalBlobs: 0,
            migratedBlobs: 0,
            skippedBlobs: 0,
            failedBlobs: 0,
            errors: []
        };
        
        for (const container of filteredContainers) {
            try {
                console.log(chalk.yellow(`\nMigrating container: ${container.name}`));
                const containerResult = await this.migrateContainer(container.name);
                
                results.migratedContainers++;
                results.totalBlobs += containerResult.totalBlobs;
                results.migratedBlobs += containerResult.migratedBlobs;
                results.skippedBlobs += containerResult.skippedBlobs;
                results.failedBlobs += containerResult.failedBlobs;
                results.errors.push(...containerResult.errors);
                
            } catch (error) {
                console.error(chalk.red(`Failed to migrate container ${container.name}: ${error.message}`));
                results.errors.push(`Container ${container.name}: ${error.message}`);
                
                if (!this.config.continueOnError) {
                    throw error;
                }
            }
        }
        
        return results;
    }
    
    /**
     * Migrate a specific container
     */
    async migrateContainer(containerName) {
        const sourceContainer = this.sourceClient.getContainerClient(containerName);
        const destinationContainer = this.destinationClient.getContainerClient(containerName);
        
        // Create destination container if it doesn't exist
        try {
            await destinationContainer.createIfNotExists({
                access: 'private' // Default to private, will be updated later
            });
        } catch (error) {
            throw new Error(`Failed to create destination container ${containerName}: ${error.message}`);
        }
        
        // Copy container properties and metadata
        try {
            const sourceProperties = await sourceContainer.getProperties();
            
            // Set container metadata
            if (sourceProperties.metadata && Object.keys(sourceProperties.metadata).length > 0) {
                await destinationContainer.setMetadata(sourceProperties.metadata);
            }
            
            // Set public access level if different from private
            if (sourceProperties.publicAccess && sourceProperties.publicAccess !== 'none') {
                await destinationContainer.setAccessPolicy(sourceProperties.publicAccess);
            }
        } catch (error) {
            console.warn(chalk.yellow(`Warning: Could not copy container properties for ${containerName}: ${error.message}`));
        }
        
        // List and migrate blobs
        const blobs = [];
        try {
            for await (const blob of sourceContainer.listBlobsFlat({ includeMetadata: true, includeSnapshots: false })) {
                if (this._shouldIncludeBlob(blob.name)) {
                    blobs.push(blob);
                }
            }
        } catch (error) {
            throw new Error(`Failed to list blobs in container ${containerName}: ${error.message}`);
        }
        
        console.log(chalk.blue(`Found ${blobs.length} blobs in container ${containerName}`));
        
        const results = {
            containerName,
            totalBlobs: blobs.length,
            migratedBlobs: 0,
            skippedBlobs: 0,
            failedBlobs: 0,
            errors: []
        };
        
        if (blobs.length === 0) {
            return results;
        }
        
        // Create progress bar
        const progressBar = new ProgressBar(
            `  Migrating blobs [:bar] :current/:total (:percent) :etas`,
            {
                complete: '█',
                incomplete: '░',
                width: 40,
                total: blobs.length
            }
        );
        
        // Process blobs in batches
        const batches = this._createBatches(blobs, this.config.batchSize);
        
        for (const batch of batches) {
            const batchPromises = batch.map(blob => this._migrateBlob(containerName, blob, results, progressBar));
            await Promise.allSettled(batchPromises);
        }
        
        progressBar.terminate();
        
        return results;
    }
    
    /**
     * Migrate a single blob
     */
    async _migrateBlob(containerName, blob, results, progressBar) {
        let retries = 0;
        
        while (retries <= this.config.maxRetries) {
            try {
                const sourceBlobClient = this.sourceClient.getContainerClient(containerName).getBlobClient(blob.name);
                const destinationBlobClient = this.destinationClient.getContainerClient(containerName).getBlobClient(blob.name);
                
                // Check if blob already exists in destination
                if (this.config.skipExisting) {
                    try {
                        await destinationBlobClient.getProperties();
                        results.skippedBlobs++;
                        progressBar.tick();
                        return;
                    } catch (error) {
                        // Blob doesn't exist, continue with migration
                    }
                }
                
                // Start copy operation
                const copyResult = await destinationBlobClient.startCopyFromURL(sourceBlobClient.url);
                
                // Wait for copy to complete
                let copyStatus = copyResult.copyStatus;
                while (copyStatus === 'pending') {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const properties = await destinationBlobClient.getProperties();
                    copyStatus = properties.copyStatus;
                }
                
                if (copyStatus === 'success') {
                    // Copy metadata and properties if needed
                    if (this.config.preserveMetadata && blob.metadata && Object.keys(blob.metadata).length > 0) {
                        await destinationBlobClient.setMetadata(blob.metadata);
                    }
                    
                    // Set access tier if needed
                    if (this.config.preserveAccessTier && blob.properties.accessTier) {
                        try {
                            await destinationBlobClient.setAccessTier(blob.properties.accessTier);
                        } catch (error) {
                            // Access tier might not be supported, continue
                        }
                    }
                    
                    results.migratedBlobs++;
                } else {
                    throw new Error(`Copy failed with status: ${copyStatus}`);
                }
                
                progressBar.tick();
                return;
                
            } catch (error) {
                retries++;
                if (retries > this.config.maxRetries) {
                    results.failedBlobs++;
                    results.errors.push(`${containerName}/${blob.name}: ${error.message}`);
                    
                    if (!this.config.continueOnError) {
                        throw error;
                    }
                } else {
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * retries));
                }
            }
        }
        
        progressBar.tick();
    }
    
    /**
     * Filter containers based on configuration
     */
    _filterContainers(containers) {
        if (!this.config.containerFilter) {
            return containers;
        }
        
        const filterRegex = new RegExp(this.config.containerFilter, 'i');
        return containers.filter(container => filterRegex.test(container.name));
    }
    
    /**
     * Check if blob should be included based on filters
     */
    _shouldIncludeBlob(blobName) {
        // Check prefix filter
        if (this.config.blobPrefix && !blobName.startsWith(this.config.blobPrefix)) {
            return false;
        }
        
        // Check exclude patterns
        if (this.config.excludePatterns && this.config.excludePatterns.length > 0) {
            for (const pattern of this.config.excludePatterns) {
                const regex = new RegExp(pattern, 'i');
                if (regex.test(blobName)) {
                    return false;
                }
            }
        }
        
        return true;
    }
    
    /**
     * Create batches for parallel processing
     */
    _createBatches(items, batchSize) {
        const batches = [];
        for (let i = 0; i < items.length; i += batchSize) {
            batches.push(items.slice(i, i + batchSize));
        }
        return batches;
    }
}
