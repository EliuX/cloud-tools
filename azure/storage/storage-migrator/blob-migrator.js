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
            // Create container without public access (private by default)
            await destinationContainer.createIfNotExists();
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
     * Synchronize containers from source to destination
     */
    async synchronizeContainers() {
        console.log(chalk.blue('Starting container synchronization...'));
        
        const results = {
            totalSourceContainers: 0,
            totalDestinationContainers: 0,
            createdContainers: 0,
            updatedContainers: 0,
            deletedContainers: 0,
            skippedContainers: 0,
            errors: [],
            containerActions: []
        };
        
        try {
            // Get source and destination containers
            console.log(chalk.yellow('Analyzing source containers...'));
            const sourceContainers = await this.listContainers();
            results.totalSourceContainers = sourceContainers.length;
            
            console.log(chalk.yellow('Analyzing destination containers...'));
            const destinationContainers = await this._listDestinationContainers();
            results.totalDestinationContainers = destinationContainers.length;
            
            console.log(chalk.blue(`Found ${sourceContainers.length} source containers and ${destinationContainers.length} destination containers`));
            
            // Create maps for easier lookup
            const sourceContainerMap = new Map(sourceContainers.map(c => [c.name, c]));
            const destinationContainerMap = new Map(destinationContainers.map(c => [c.name, c]));
            
            // Determine actions needed
            const actions = this._planContainerActions(sourceContainerMap, destinationContainerMap);
            
            console.log(chalk.blue(`Planned actions: ${actions.create.length} create, ${actions.update.length} update, ${actions.delete.length} delete`));
            
            // Execute actions
            if (actions.create.length > 0) {
                console.log(chalk.yellow(`\nCreating ${actions.create.length} new containers...`));
                await this._executeContainerCreateActions(actions.create, results);
            }
            
            if (actions.update.length > 0) {
                console.log(chalk.yellow(`\nUpdating ${actions.update.length} existing containers...`));
                await this._executeContainerUpdateActions(actions.update, results);
            }
            
            if (actions.delete.length > 0 && !this.config.preserveDestinationContainers) {
                console.log(chalk.yellow(`\nDeleting ${actions.delete.length} obsolete containers...`));
                await this._executeContainerDeleteActions(actions.delete, results);
            } else if (actions.delete.length > 0) {
                console.log(chalk.yellow(`\nSkipping deletion of ${actions.delete.length} containers (preservation enabled)`));
                results.skippedContainers += actions.delete.length;
            }
            
            return results;
            
        } catch (error) {
            throw new Error(`Container synchronization failed: ${error.message}`);
        }
    }
    
    /**
     * List destination containers
     */
    async _listDestinationContainers() {
        const containers = [];
        
        try {
            for await (const container of this.destinationClient.listContainers()) {
                const containerClient = this.destinationClient.getContainerClient(container.name);
                const properties = await containerClient.getProperties();
                
                containers.push({
                    name: container.name,
                    lastModified: container.properties.lastModified,
                    publicAccess: container.properties.publicAccess,
                    hasImmutabilityPolicy: container.properties.hasImmutabilityPolicy,
                    hasLegalHold: container.properties.hasLegalHold,
                    metadata: properties.metadata || {}
                });
            }
            
            return containers;
        } catch (error) {
            throw new Error(`Failed to list destination containers: ${error.message}`);
        }
    }
    
    /**
     * Plan actions needed to synchronize containers
     */
    _planContainerActions(sourceContainerMap, destinationContainerMap) {
        const actions = {
            create: [],
            update: [],
            delete: []
        };
        
        // Find containers to create or update
        for (const [containerName, sourceContainer] of sourceContainerMap) {
            if (!destinationContainerMap.has(containerName)) {
                // Container doesn't exist in destination - create it
                actions.create.push(sourceContainer);
            } else {
                // Container exists - check if properties need updating
                const destinationContainer = destinationContainerMap.get(containerName);
                if (this._shouldUpdateContainer(sourceContainer, destinationContainer)) {
                    actions.update.push({
                        name: containerName,
                        sourceContainer,
                        destinationContainer
                    });
                }
            }
        }
        
        // Find containers to delete (exist in destination but not in source)
        for (const [containerName, destinationContainer] of destinationContainerMap) {
            if (!sourceContainerMap.has(containerName)) {
                actions.delete.push(destinationContainer);
            }
        }
        
        return actions;
    }
    
    /**
     * Check if a container needs updating
     */
    _shouldUpdateContainer(sourceContainer, destinationContainer) {
        // Compare public access level
        if (sourceContainer.publicAccess !== destinationContainer.publicAccess) {
            return true;
        }
        
        // Compare metadata if preservation is enabled
        if (this.config.preserveMetadata) {
            const sourceMetadata = sourceContainer.metadata || {};
            const destinationMetadata = destinationContainer.metadata || {};
            
            const sourceKeys = Object.keys(sourceMetadata).sort();
            const destinationKeys = Object.keys(destinationMetadata).sort();
            
            if (sourceKeys.length !== destinationKeys.length) {
                return true;
            }
            
            for (const key of sourceKeys) {
                if (sourceMetadata[key] !== destinationMetadata[key]) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Execute container creation actions
     */
    async _executeContainerCreateActions(createActions, results) {
        const progressBar = new ProgressBar(
            '  Creating containers [:bar] :current/:total (:percent) :etas',
            {
                complete: '█',
                incomplete: '░',
                width: 40,
                total: createActions.length
            }
        );
        
        for (const container of createActions) {
            let retries = 0;
            
            while (retries <= this.config.maxRetries) {
                try {
                    const destinationContainer = this.destinationClient.getContainerClient(container.name);
                    
                    // Create the container
                    const createOptions = {};
                    if (container.publicAccess && container.publicAccess !== 'none') {
                        createOptions.access = container.publicAccess;
                    }
                    // If no public access or 'none', create private container (no access option)
                    await destinationContainer.create(createOptions);
                    
                    // Set metadata if present and preservation is enabled
                    if (this.config.preserveMetadata && container.metadata && Object.keys(container.metadata).length > 0) {
                        await destinationContainer.setMetadata(container.metadata);
                    }
                    
                    results.createdContainers++;
                    results.containerActions.push({
                        action: 'create',
                        containerName: container.name,
                        success: true
                    });
                    
                    break;
                    
                } catch (error) {
                    retries++;
                    if (retries > this.config.maxRetries) {
                        results.errors.push(`Failed to create container ${container.name}: ${error.message}`);
                        results.containerActions.push({
                            action: 'create',
                            containerName: container.name,
                            success: false,
                            error: error.message
                        });
                        
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
        
        progressBar.terminate();
    }
    
    /**
     * Execute container update actions
     */
    async _executeContainerUpdateActions(updateActions, results) {
        const progressBar = new ProgressBar(
            '  Updating containers [:bar] :current/:total (:percent) :etas',
            {
                complete: '█',
                incomplete: '░',
                width: 40,
                total: updateActions.length
            }
        );
        
        for (const action of updateActions) {
            let retries = 0;
            
            while (retries <= this.config.maxRetries) {
                try {
                    const destinationContainer = this.destinationClient.getContainerClient(action.name);
                    
                    // Update public access level
                    if (action.sourceContainer.publicAccess !== action.destinationContainer.publicAccess) {
                        await destinationContainer.setAccessPolicy(action.sourceContainer.publicAccess || 'none');
                    }
                    
                    // Update metadata if preservation is enabled
                    if (this.config.preserveMetadata) {
                        await destinationContainer.setMetadata(action.sourceContainer.metadata || {});
                    }
                    
                    results.updatedContainers++;
                    results.containerActions.push({
                        action: 'update',
                        containerName: action.name,
                        success: true
                    });
                    
                    break;
                    
                } catch (error) {
                    retries++;
                    if (retries > this.config.maxRetries) {
                        results.errors.push(`Failed to update container ${action.name}: ${error.message}`);
                        results.containerActions.push({
                            action: 'update',
                            containerName: action.name,
                            success: false,
                            error: error.message
                        });
                        
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
        
        progressBar.terminate();
    }
    
    /**
     * Execute container deletion actions
     */
    async _executeContainerDeleteActions(deleteActions, results) {
        const progressBar = new ProgressBar(
            '  Deleting containers [:bar] :current/:total (:percent) :etas',
            {
                complete: '█',
                incomplete: '░',
                width: 40,
                total: deleteActions.length
            }
        );
        
        for (const container of deleteActions) {
            let retries = 0;
            
            while (retries <= this.config.maxRetries) {
                try {
                    const destinationContainer = this.destinationClient.getContainerClient(container.name);
                    
                    // Delete the container
                    await destinationContainer.delete();
                    
                    results.deletedContainers++;
                    results.containerActions.push({
                        action: 'delete',
                        containerName: container.name,
                        success: true
                    });
                    
                    break;
                    
                } catch (error) {
                    retries++;
                    if (retries > this.config.maxRetries) {
                        results.errors.push(`Failed to delete container ${container.name}: ${error.message}`);
                        results.containerActions.push({
                            action: 'delete',
                            containerName: container.name,
                            success: false,
                            error: error.message
                        });
                        
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
        
        progressBar.terminate();
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