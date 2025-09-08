/**
 * Azure Storage Queue migration functionality
 */

import { QueueServiceClient } from '@azure/storage-queue';
import chalk from 'chalk';
import ProgressBar from 'progress';

export class QueueMigrator {
    constructor(sourceOptions, destinationOptions, config) {
        this.config = config;
        
        // Initialize source client
        if (sourceOptions.connectionString) {
            this.sourceClient = QueueServiceClient.fromConnectionString(sourceOptions.connectionString);
        } else {
            const sourceUrl = `https://${sourceOptions.accountName}.queue.core.windows.net`;
            if (sourceOptions.accountKey) {
                this.sourceClient = new QueueServiceClient(sourceUrl, {
                    accountName: sourceOptions.accountName,
                    accountKey: sourceOptions.accountKey
                });
            } else if (sourceOptions.sasToken) {
                this.sourceClient = new QueueServiceClient(`${sourceUrl}?${sourceOptions.sasToken}`);
            }
        }
        
        // Initialize destination client
        if (destinationOptions.connectionString) {
            this.destinationClient = QueueServiceClient.fromConnectionString(destinationOptions.connectionString);
        } else {
            const destinationUrl = `https://${destinationOptions.accountName}.queue.core.windows.net`;
            if (destinationOptions.accountKey) {
                this.destinationClient = new QueueServiceClient(destinationUrl, {
                    accountName: destinationOptions.accountName,
                    accountKey: destinationOptions.accountKey
                });
            } else if (destinationOptions.sasToken) {
                this.destinationClient = new QueueServiceClient(`${destinationUrl}?${destinationOptions.sasToken}`);
            }
        }
    }
    
    /**
     * List all queues in source storage account
     */
    async listSourceQueues() {
        const queues = [];
        
        try {
            for await (const queue of this.sourceClient.listQueues()) {
                const queueClient = this.sourceClient.getQueueClient(queue.name);
                const properties = await queueClient.getProperties();
                
                queues.push({
                    name: queue.name,
                    metadata: properties.metadata || {},
                    approximateMessagesCount: properties.approximateMessagesCount || 0
                });
            }
            
            return queues;
        } catch (error) {
            throw new Error(`Failed to list source queues: ${error.message}`);
        }
    }
    
    /**
     * List all queues in destination storage account
     */
    async listDestinationQueues() {
        const queues = [];
        
        try {
            for await (const queue of this.destinationClient.listQueues()) {
                const queueClient = this.destinationClient.getQueueClient(queue.name);
                const properties = await queueClient.getProperties();
                
                queues.push({
                    name: queue.name,
                    metadata: properties.metadata || {},
                    approximateMessagesCount: properties.approximateMessagesCount || 0
                });
            }
            
            return queues;
        } catch (error) {
            throw new Error(`Failed to list destination queues: ${error.message}`);
        }
    }
    
    /**
     * Synchronize queues from source to destination
     */
    async synchronizeQueues() {
        console.log(chalk.blue('Starting queue synchronization...'));
        
        const results = {
            totalSourceQueues: 0,
            totalDestinationQueues: 0,
            createdQueues: 0,
            updatedQueues: 0,
            deletedQueues: 0,
            skippedQueues: 0,
            errors: [],
            queueActions: []
        };
        
        try {
            // Get source and destination queues
            console.log(chalk.yellow('Analyzing source queues...'));
            const sourceQueues = await this.listSourceQueues();
            results.totalSourceQueues = sourceQueues.length;
            
            console.log(chalk.yellow('Analyzing destination queues...'));
            const destinationQueues = await this.listDestinationQueues();
            results.totalDestinationQueues = destinationQueues.length;
            
            console.log(chalk.blue(`Found ${sourceQueues.length} source queues and ${destinationQueues.length} destination queues`));
            
            // Create maps for easier lookup
            const sourceQueueMap = new Map(sourceQueues.map(q => [q.name, q]));
            const destinationQueueMap = new Map(destinationQueues.map(q => [q.name, q]));
            
            // Determine actions needed
            const actions = this._planQueueActions(sourceQueueMap, destinationQueueMap);
            
            console.log(chalk.blue(`Planned actions: ${actions.create.length} create, ${actions.update.length} update, ${actions.delete.length} delete`));
            
            // Execute actions
            if (actions.create.length > 0) {
                console.log(chalk.yellow(`\nCreating ${actions.create.length} new queues...`));
                await this._executeCreateActions(actions.create, results);
            }
            
            if (actions.update.length > 0) {
                console.log(chalk.yellow(`\nUpdating ${actions.update.length} existing queues...`));
                await this._executeUpdateActions(actions.update, results);
            }
            
            if (actions.delete.length > 0 && !this.config.preserveDestinationQueues) {
                console.log(chalk.yellow(`\nDeleting ${actions.delete.length} obsolete queues...`));
                await this._executeDeleteActions(actions.delete, results);
            } else if (actions.delete.length > 0) {
                console.log(chalk.yellow(`\nSkipping deletion of ${actions.delete.length} queues (preservation enabled)`));
                results.skippedQueues += actions.delete.length;
            }
            
            return results;
            
        } catch (error) {
            throw new Error(`Queue synchronization failed: ${error.message}`);
        }
    }
    
    /**
     * Plan actions needed to synchronize queues
     */
    _planQueueActions(sourceQueueMap, destinationQueueMap) {
        const actions = {
            create: [],
            update: [],
            delete: []
        };
        
        // Find queues to create or update
        for (const [queueName, sourceQueue] of sourceQueueMap) {
            if (!destinationQueueMap.has(queueName)) {
                // Queue doesn't exist in destination - create it
                actions.create.push(sourceQueue);
            } else {
                // Queue exists - check if metadata needs updating
                const destinationQueue = destinationQueueMap.get(queueName);
                if (this._shouldUpdateQueue(sourceQueue, destinationQueue)) {
                    actions.update.push({
                        name: queueName,
                        sourceQueue,
                        destinationQueue
                    });
                }
            }
        }
        
        // Find queues to delete (exist in destination but not in source)
        for (const [queueName, destinationQueue] of destinationQueueMap) {
            if (!sourceQueueMap.has(queueName)) {
                actions.delete.push(destinationQueue);
            }
        }
        
        return actions;
    }
    
    /**
     * Check if a queue needs updating
     */
    _shouldUpdateQueue(sourceQueue, destinationQueue) {
        if (!this.config.preserveMetadata) {
            return false;
        }
        
        // Compare metadata
        const sourceMetadata = sourceQueue.metadata || {};
        const destinationMetadata = destinationQueue.metadata || {};
        
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
        
        return false;
    }
    
    /**
     * Execute queue creation actions
     */
    async _executeCreateActions(createActions, results) {
        const progressBar = new ProgressBar(
            '  Creating queues [:bar] :current/:total (:percent) :etas',
            {
                complete: '█',
                incomplete: '░',
                width: 40,
                total: createActions.length
            }
        );
        
        for (const queue of createActions) {
            let retries = 0;
            
            while (retries <= this.config.maxRetries) {
                try {
                    const destinationQueueClient = this.destinationClient.getQueueClient(queue.name);
                    
                    // Create the queue
                    await destinationQueueClient.create();
                    
                    // Set metadata if present and preservation is enabled
                    if (this.config.preserveMetadata && queue.metadata && Object.keys(queue.metadata).length > 0) {
                        await destinationQueueClient.setMetadata(queue.metadata);
                    }
                    
                    results.createdQueues++;
                    results.queueActions.push({
                        action: 'create',
                        queueName: queue.name,
                        success: true
                    });
                    
                    break;
                    
                } catch (error) {
                    retries++;
                    if (retries > this.config.maxRetries) {
                        results.errors.push(`Failed to create queue ${queue.name}: ${error.message}`);
                        results.queueActions.push({
                            action: 'create',
                            queueName: queue.name,
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
     * Execute queue update actions
     */
    async _executeUpdateActions(updateActions, results) {
        const progressBar = new ProgressBar(
            '  Updating queues [:bar] :current/:total (:percent) :etas',
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
                    const destinationQueueClient = this.destinationClient.getQueueClient(action.name);
                    
                    // Update metadata
                    if (this.config.preserveMetadata) {
                        await destinationQueueClient.setMetadata(action.sourceQueue.metadata || {});
                    }
                    
                    results.updatedQueues++;
                    results.queueActions.push({
                        action: 'update',
                        queueName: action.name,
                        success: true
                    });
                    
                    break;
                    
                } catch (error) {
                    retries++;
                    if (retries > this.config.maxRetries) {
                        results.errors.push(`Failed to update queue ${action.name}: ${error.message}`);
                        results.queueActions.push({
                            action: 'update',
                            queueName: action.name,
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
     * Execute queue deletion actions
     */
    async _executeDeleteActions(deleteActions, results) {
        const progressBar = new ProgressBar(
            '  Deleting queues [:bar] :current/:total (:percent) :etas',
            {
                complete: '█',
                incomplete: '░',
                width: 40,
                total: deleteActions.length
            }
        );
        
        for (const queue of deleteActions) {
            let retries = 0;
            
            while (retries <= this.config.maxRetries) {
                try {
                    const destinationQueueClient = this.destinationClient.getQueueClient(queue.name);
                    
                    // Delete the queue
                    await destinationQueueClient.delete();
                    
                    results.deletedQueues++;
                    results.queueActions.push({
                        action: 'delete',
                        queueName: queue.name,
                        success: true
                    });
                    
                    break;
                    
                } catch (error) {
                    retries++;
                    if (retries > this.config.maxRetries) {
                        results.errors.push(`Failed to delete queue ${queue.name}: ${error.message}`);
                        results.queueActions.push({
                            action: 'delete',
                            queueName: queue.name,
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
     * Copy queue messages (optional functionality)
     */
    async copyQueueMessages(queueName) {
        console.log(chalk.yellow(`Copying messages from queue: ${queueName}`));
        
        const sourceQueueClient = this.sourceClient.getQueueClient(queueName);
        const destinationQueueClient = this.destinationClient.getQueueClient(queueName);
        
        const results = {
            queueName,
            totalMessages: 0,
            copiedMessages: 0,
            failedMessages: 0,
            errors: []
        };
        
        try {
            // Peek messages to get count (approximate)
            const properties = await sourceQueueClient.getProperties();
            results.totalMessages = properties.approximateMessagesCount;
            
            if (results.totalMessages === 0) {
                console.log(chalk.gray(`  Queue ${queueName} is empty`));
                return results;
            }
            
            console.log(chalk.blue(`  Found approximately ${results.totalMessages} messages in queue ${queueName}`));
            
            // Process messages in batches
            let hasMoreMessages = true;
            
            while (hasMoreMessages) {
                try {
                    // Receive messages (up to 32 at a time)
                    const response = await sourceQueueClient.receiveMessages({
                        numberOfMessages: Math.min(32, this.config.batchSize)
                    });
                    
                    if (!response.receivedMessageItems || response.receivedMessageItems.length === 0) {
                        hasMoreMessages = false;
                        break;
                    }
                    
                    // Send messages to destination
                    for (const message of response.receivedMessageItems) {
                        try {
                            await destinationQueueClient.sendMessage(message.messageText);
                            
                            // Delete from source after successful copy
                            await sourceQueueClient.deleteMessage(message.messageId, message.popReceipt);
                            
                            results.copiedMessages++;
                            
                        } catch (error) {
                            results.failedMessages++;
                            results.errors.push(`Message ${message.messageId}: ${error.message}`);
                            
                            if (!this.config.continueOnError) {
                                throw error;
                            }
                        }
                    }
                    
                } catch (error) {
                    if (error.statusCode === 404) {
                        // No more messages
                        hasMoreMessages = false;
                    } else {
                        throw error;
                    }
                }
            }
            
            return results;
            
        } catch (error) {
            throw new Error(`Failed to copy messages from queue ${queueName}: ${error.message}`);
        }
    }
}
