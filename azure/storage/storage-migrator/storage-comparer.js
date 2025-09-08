/**
 * Azure Storage Account comparison functionality
 * Analyzes differences between source and target storage accounts
 */

import { BlobMigrator } from './blob-migrator.js';
import { QueueMigrator } from './queue-migrator.js';
import chalk from 'chalk';

export class StorageComparer {
    constructor(sourceOptions, destinationOptions, config) {
        this.config = config;
        this.sourceOptions = sourceOptions;
        this.destinationOptions = destinationOptions;
        
        // Initialize service clients for comparison
        if (config.includeBlobs) {
            this.blobMigrator = new BlobMigrator(sourceOptions, destinationOptions, config);
        }
        
        if (config.includeQueues) {
            this.queueMigrator = new QueueMigrator(sourceOptions, destinationOptions, config);
        }
        
        // TODO: Add other service migrators when implemented
    }
    
    /**
     * Perform comprehensive comparison between source and destination storage accounts
     */
    async compareStorageAccounts() {
        console.log(chalk.blue('Analyzing storage account differences...'));
        console.log(chalk.blue(`Source: ${this.config.getSourceAccountUrl()}`));
        console.log(chalk.blue(`Destination: ${this.config.getDestinationAccountUrl()}`));
        
        const comparison = {
            timestamp: new Date(),
            source: {
                accountUrl: this.config.getSourceAccountUrl(),
                services: {}
            },
            destination: {
                accountUrl: this.config.getDestinationAccountUrl(),
                services: {}
            },
            differences: {
                containers: null,
                queues: null,
                files: null,
                tables: null
            },
            summary: {
                totalDifferences: 0,
                servicesAnalyzed: 0,
                recommendedActions: []
            }
        };
        
        try {
            // Compare Blob Storage
            if (this.config.includeBlobs && this.blobMigrator) {
                console.log(chalk.yellow('\n📦 Analyzing Blob Storage...'));
                comparison.differences.containers = await this.compareBlobContainers();
                comparison.summary.servicesAnalyzed++;
            }
            
            // Compare Queue Storage
            if (this.config.includeQueues && this.queueMigrator) {
                console.log(chalk.yellow('\n📬 Analyzing Queue Storage...'));
                comparison.differences.queues = await this.compareQueues();
                comparison.summary.servicesAnalyzed++;
            }
            
            // TODO: Add File Share comparison
            if (this.config.includeFiles) {
                console.log(chalk.yellow('\n📁 File Share comparison not yet implemented'));
            }
            
            // TODO: Add Table comparison
            if (this.config.includeTables) {
                console.log(chalk.yellow('\n📊 Table comparison not yet implemented'));
            }
            
            // Calculate summary
            this._calculateSummary(comparison);
            
            return comparison;
            
        } catch (error) {
            throw new Error(`Storage account comparison failed: ${error.message}`);
        }
    }
    
    /**
     * Compare blob containers between source and destination
     */
    async compareBlobContainers() {
        const sourceContainers = await this.blobMigrator.listContainers();
        
        let destinationContainers = [];
        try {
            const destinationClient = this.blobMigrator.destinationClient;
            for await (const container of destinationClient.listContainers()) {
                const containerClient = destinationClient.getContainerClient(container.name);
                const properties = await containerClient.getProperties();
                
                destinationContainers.push({
                    name: container.name,
                    lastModified: container.properties.lastModified,
                    publicAccess: container.properties.publicAccess,
                    hasImmutabilityPolicy: container.properties.hasImmutabilityPolicy,
                    hasLegalHold: container.properties.hasLegalHold,
                    metadata: properties.metadata || {}
                });
            }
        } catch (error) {
            console.warn(chalk.yellow(`Warning: Could not list destination containers: ${error.message}`));
        }
        
        return this._compareContainerLists(sourceContainers, destinationContainers);
    }
    
    /**
     * Compare queues between source and destination
     */
    async compareQueues() {
        const sourceQueues = await this.queueMigrator.listSourceQueues();
        
        let destinationQueues = [];
        try {
            destinationQueues = await this.queueMigrator.listDestinationQueues();
        } catch (error) {
            console.warn(chalk.yellow(`Warning: Could not list destination queues: ${error.message}`));
        }
        
        return this._compareQueueLists(sourceQueues, destinationQueues);
    }
    
    /**
     * Compare container lists and identify differences
     */
    _compareContainerLists(sourceContainers, destinationContainers) {
        const sourceMap = new Map(sourceContainers.map(c => [c.name, c]));
        const destinationMap = new Map(destinationContainers.map(c => [c.name, c]));
        
        const comparison = {
            source: {
                total: sourceContainers.length,
                containers: sourceContainers.map(c => ({
                    name: c.name,
                    lastModified: c.lastModified,
                    publicAccess: c.publicAccess,
                    hasMetadata: Object.keys(c.metadata || {}).length > 0
                }))
            },
            destination: {
                total: destinationContainers.length,
                containers: destinationContainers.map(c => ({
                    name: c.name,
                    lastModified: c.lastModified,
                    publicAccess: c.publicAccess,
                    hasMetadata: Object.keys(c.metadata || {}).length > 0
                }))
            },
            differences: {
                missingInDestination: [],
                missingInSource: [],
                configurationDifferences: [],
                metadataDifferences: []
            },
            actions: {
                create: [],
                update: [],
                delete: []
            }
        };
        
        // Find containers missing in destination
        for (const [name, sourceContainer] of sourceMap) {
            if (!destinationMap.has(name)) {
                comparison.differences.missingInDestination.push({
                    name,
                    publicAccess: sourceContainer.publicAccess,
                    hasMetadata: Object.keys(sourceContainer.metadata || {}).length > 0
                });
                comparison.actions.create.push(name);
            } else {
                // Compare existing containers
                const destinationContainer = destinationMap.get(name);
                const differences = this._compareContainerProperties(sourceContainer, destinationContainer);
                
                if (differences.length > 0) {
                    comparison.differences.configurationDifferences.push({
                        name,
                        differences
                    });
                    comparison.actions.update.push(name);
                }
            }
        }
        
        // Find containers missing in source (exist only in destination)
        for (const [name, destinationContainer] of destinationMap) {
            if (!sourceMap.has(name)) {
                comparison.differences.missingInSource.push({
                    name,
                    publicAccess: destinationContainer.publicAccess,
                    hasMetadata: Object.keys(destinationContainer.metadata || {}).length > 0
                });
                if (!this.config.preserveDestinationQueues) {
                    comparison.actions.delete.push(name);
                }
            }
        }
        
        return comparison;
    }
    
    /**
     * Compare queue lists and identify differences
     */
    _compareQueueLists(sourceQueues, destinationQueues) {
        const sourceMap = new Map(sourceQueues.map(q => [q.name, q]));
        const destinationMap = new Map(destinationQueues.map(q => [q.name, q]));
        
        const comparison = {
            source: {
                total: sourceQueues.length,
                queues: sourceQueues.map(q => ({
                    name: q.name,
                    approximateMessagesCount: q.approximateMessagesCount,
                    hasMetadata: Object.keys(q.metadata || {}).length > 0
                }))
            },
            destination: {
                total: destinationQueues.length,
                queues: destinationQueues.map(q => ({
                    name: q.name,
                    approximateMessagesCount: q.approximateMessagesCount,
                    hasMetadata: Object.keys(q.metadata || {}).length > 0
                }))
            },
            differences: {
                missingInDestination: [],
                missingInSource: [],
                metadataDifferences: []
            },
            actions: {
                create: [],
                update: [],
                delete: []
            }
        };
        
        // Find queues missing in destination
        for (const [name, sourceQueue] of sourceMap) {
            if (!destinationMap.has(name)) {
                comparison.differences.missingInDestination.push({
                    name,
                    approximateMessagesCount: sourceQueue.approximateMessagesCount,
                    hasMetadata: Object.keys(sourceQueue.metadata || {}).length > 0
                });
                comparison.actions.create.push(name);
            } else {
                // Compare existing queues
                const destinationQueue = destinationMap.get(name);
                const metadataDifferences = this._compareMetadata(sourceQueue.metadata, destinationQueue.metadata);
                
                if (metadataDifferences.length > 0) {
                    comparison.differences.metadataDifferences.push({
                        name,
                        differences: metadataDifferences
                    });
                    comparison.actions.update.push(name);
                }
            }
        }
        
        // Find queues missing in source (exist only in destination)
        for (const [name, destinationQueue] of destinationMap) {
            if (!sourceMap.has(name)) {
                comparison.differences.missingInSource.push({
                    name,
                    approximateMessagesCount: destinationQueue.approximateMessagesCount,
                    hasMetadata: Object.keys(destinationQueue.metadata || {}).length > 0
                });
                if (!this.config.preserveDestinationQueues) {
                    comparison.actions.delete.push(name);
                }
            }
        }
        
        return comparison;
    }
    
    /**
     * Compare container properties
     */
    _compareContainerProperties(sourceContainer, destinationContainer) {
        const differences = [];
        
        if (sourceContainer.publicAccess !== destinationContainer.publicAccess) {
            differences.push({
                property: 'publicAccess',
                source: sourceContainer.publicAccess,
                destination: destinationContainer.publicAccess
            });
        }
        
        const metadataDifferences = this._compareMetadata(sourceContainer.metadata, destinationContainer.metadata);
        if (metadataDifferences.length > 0) {
            differences.push({
                property: 'metadata',
                differences: metadataDifferences
            });
        }
        
        return differences;
    }
    
    /**
     * Compare metadata objects
     */
    _compareMetadata(sourceMetadata = {}, destinationMetadata = {}) {
        const differences = [];
        const sourceKeys = new Set(Object.keys(sourceMetadata));
        const destinationKeys = new Set(Object.keys(destinationMetadata));
        
        // Find missing keys in destination
        for (const key of sourceKeys) {
            if (!destinationKeys.has(key)) {
                differences.push({
                    type: 'missing_in_destination',
                    key,
                    sourceValue: sourceMetadata[key]
                });
            } else if (sourceMetadata[key] !== destinationMetadata[key]) {
                differences.push({
                    type: 'value_difference',
                    key,
                    sourceValue: sourceMetadata[key],
                    destinationValue: destinationMetadata[key]
                });
            }
        }
        
        // Find extra keys in destination
        for (const key of destinationKeys) {
            if (!sourceKeys.has(key)) {
                differences.push({
                    type: 'extra_in_destination',
                    key,
                    destinationValue: destinationMetadata[key]
                });
            }
        }
        
        return differences;
    }
    
    /**
     * Calculate summary statistics and recommendations
     */
    _calculateSummary(comparison) {
        let totalDifferences = 0;
        const recommendations = [];
        
        // Count container differences
        if (comparison.differences.containers) {
            const containers = comparison.differences.containers;
            totalDifferences += containers.differences.missingInDestination.length;
            totalDifferences += containers.differences.missingInSource.length;
            totalDifferences += containers.differences.configurationDifferences.length;
            
            if (containers.actions.create.length > 0) {
                recommendations.push(`Create ${containers.actions.create.length} missing containers in destination`);
            }
            if (containers.actions.update.length > 0) {
                recommendations.push(`Update ${containers.actions.update.length} containers with configuration differences`);
            }
            if (containers.actions.delete.length > 0) {
                recommendations.push(`Delete ${containers.actions.delete.length} extra containers from destination`);
            }
        }
        
        // Count queue differences
        if (comparison.differences.queues) {
            const queues = comparison.differences.queues;
            totalDifferences += queues.differences.missingInDestination.length;
            totalDifferences += queues.differences.missingInSource.length;
            totalDifferences += queues.differences.metadataDifferences.length;
            
            if (queues.actions.create.length > 0) {
                recommendations.push(`Create ${queues.actions.create.length} missing queues in destination`);
            }
            if (queues.actions.update.length > 0) {
                recommendations.push(`Update ${queues.actions.update.length} queues with metadata differences`);
            }
            if (queues.actions.delete.length > 0) {
                recommendations.push(`Delete ${queues.actions.delete.length} extra queues from destination`);
            }
        }
        
        comparison.summary.totalDifferences = totalDifferences;
        comparison.summary.recommendedActions = recommendations;
    }
    
    /**
     * Generate a human-readable comparison report
     */
    generateReport(comparison) {
        const report = [];
        
        // Header
        report.push(chalk.blue('=' .repeat(80)));
        report.push(chalk.blue('📊 STORAGE ACCOUNT COMPARISON REPORT'));
        report.push(chalk.blue('=' .repeat(80)));
        report.push(chalk.blue(`Generated: ${comparison.timestamp.toISOString()}`));
        report.push(chalk.blue(`Source: ${comparison.source.accountUrl}`));
        report.push(chalk.blue(`Destination: ${comparison.destination.accountUrl}`));
        report.push('');
        
        // Summary
        report.push(chalk.yellow('📋 SUMMARY'));
        report.push(chalk.yellow('-' .repeat(40)));
        report.push(`Services Analyzed: ${comparison.summary.servicesAnalyzed}`);
        report.push(`Total Differences: ${comparison.summary.totalDifferences}`);
        report.push('');
        
        if (comparison.summary.recommendedActions.length > 0) {
            report.push(chalk.yellow('🎯 RECOMMENDED ACTIONS'));
            report.push(chalk.yellow('-' .repeat(40)));
            comparison.summary.recommendedActions.forEach((action, index) => {
                report.push(`${index + 1}. ${action}`);
            });
            report.push('');
        }
        
        // Container Analysis
        if (comparison.differences.containers) {
            report.push(...this._generateContainerReport(comparison.differences.containers));
        }
        
        // Queue Analysis
        if (comparison.differences.queues) {
            report.push(...this._generateQueueReport(comparison.differences.queues));
        }
        
        report.push(chalk.blue('=' .repeat(80)));
        
        return report.join('\n');
    }
    
    /**
     * Generate container-specific report section
     */
    _generateContainerReport(containers) {
        const report = [];
        
        report.push(chalk.cyan('📦 BLOB STORAGE CONTAINERS'));
        report.push(chalk.cyan('-' .repeat(40)));
        report.push(`Source Containers: ${containers.source.total}`);
        report.push(`Destination Containers: ${containers.destination.total}`);
        report.push('');
        
        if (containers.differences.missingInDestination.length > 0) {
            report.push(chalk.red(`❌ Missing in Destination (${containers.differences.missingInDestination.length}):`));
            containers.differences.missingInDestination.forEach(container => {
                report.push(`  • ${container.name} ${container.hasMetadata ? '(has metadata)' : ''}`);
            });
            report.push('');
        }
        
        if (containers.differences.missingInSource.length > 0) {
            report.push(chalk.yellow(`⚠️  Extra in Destination (${containers.differences.missingInSource.length}):`));
            containers.differences.missingInSource.forEach(container => {
                report.push(`  • ${container.name} ${container.hasMetadata ? '(has metadata)' : ''}`);
            });
            report.push('');
        }
        
        if (containers.differences.configurationDifferences.length > 0) {
            report.push(chalk.blue(`🔧 Configuration Differences (${containers.differences.configurationDifferences.length}):`));
            containers.differences.configurationDifferences.forEach(diff => {
                report.push(`  • ${diff.name}:`);
                diff.differences.forEach(d => {
                    if (d.property === 'metadata') {
                        report.push(`    - Metadata differences: ${d.differences.length} changes`);
                    } else {
                        report.push(`    - ${d.property}: ${d.source} → ${d.destination}`);
                    }
                });
            });
            report.push('');
        }
        
        return report;
    }
    
    /**
     * Generate queue-specific report section
     */
    _generateQueueReport(queues) {
        const report = [];
        
        report.push(chalk.cyan('📬 STORAGE QUEUES'));
        report.push(chalk.cyan('-' .repeat(40)));
        report.push(`Source Queues: ${queues.source.total}`);
        report.push(`Destination Queues: ${queues.destination.total}`);
        report.push('');
        
        if (queues.differences.missingInDestination.length > 0) {
            report.push(chalk.red(`❌ Missing in Destination (${queues.differences.missingInDestination.length}):`));
            queues.differences.missingInDestination.forEach(queue => {
                const messages = queue.approximateMessagesCount > 0 ? ` (~${queue.approximateMessagesCount} messages)` : '';
                const metadata = queue.hasMetadata ? ' (has metadata)' : '';
                report.push(`  • ${queue.name}${messages}${metadata}`);
            });
            report.push('');
        }
        
        if (queues.differences.missingInSource.length > 0) {
            report.push(chalk.yellow(`⚠️  Extra in Destination (${queues.differences.missingInSource.length}):`));
            queues.differences.missingInSource.forEach(queue => {
                const messages = queue.approximateMessagesCount > 0 ? ` (~${queue.approximateMessagesCount} messages)` : '';
                const metadata = queue.hasMetadata ? ' (has metadata)' : '';
                report.push(`  • ${queue.name}${messages}${metadata}`);
            });
            report.push('');
        }
        
        if (queues.differences.metadataDifferences.length > 0) {
            report.push(chalk.blue(`🔧 Metadata Differences (${queues.differences.metadataDifferences.length}):`));
            queues.differences.metadataDifferences.forEach(diff => {
                report.push(`  • ${diff.name}: ${diff.differences.length} metadata changes`);
            });
            report.push('');
        }
        
        return report;
    }
}
