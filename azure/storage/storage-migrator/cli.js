#!/usr/bin/env node

/**
 * Command Line Interface for Azure Storage Migration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { StorageMigrator } from './migrator.js';
import { StorageConfig } from './config.js';

const program = new Command();

program
    .name('storage-migrator')
    .description('Migrate Azure Storage Account data from one account to another')
    .version('1.0.0');

program
    .command('migrate')
    .description('Perform complete migration from source to destination storage account')
    .option('-s, --source-connection-string <string>', 'Source storage account connection string')
    .option('--source-account-name <name>', 'Source storage account name')
    .option('--source-account-key <key>', 'Source storage account key')
    .option('--source-sas-token <token>', 'Source storage account SAS token')
    .option('-d, --destination-connection-string <string>', 'Destination storage account connection string')
    .option('--destination-account-name <name>', 'Destination storage account name')
    .option('--destination-account-key <key>', 'Destination storage account key')
    .option('--destination-sas-token <token>', 'Destination storage account SAS token')
    .option('--include-blobs', 'Include blob storage migration (default: true)', true)
    .option('--include-files', 'Include file share migration')
    .option('--include-queues', 'Include queue migration')
    .option('--include-tables', 'Include table migration')
    .option('--overwrite', 'Overwrite existing items in destination')
    .option('--skip-existing', 'Skip items that already exist in destination')
    .option('--continue-on-error', 'Continue migration even if some items fail (default: true)')
    .option('--preserve-metadata', 'Preserve item metadata (default: true)', true)
    .option('--preserve-access-tier', 'Preserve blob access tiers (default: true)', true)
    .option('--container-filter <pattern>', 'Filter containers by name pattern (regex)')
    .option('--blob-prefix <prefix>', 'Only migrate blobs with this prefix')
    .option('--exclude-patterns <patterns>', 'Comma-separated patterns to exclude', (value) => value.split(','))
    .option('--batch-size <size>', 'Batch size for parallel operations (default: 10)', parseInt)
    .option('--max-concurrency <count>', 'Maximum concurrent operations (default: 5)', parseInt)
    .option('--max-retries <retries>', 'Maximum retry attempts for failed operations (default: 3)', parseInt)
    .action(async (options) => {
        const spinner = ora('Initializing migration...').start();
        
        try {
            const config = new StorageConfig({
                sourceConnectionString: options.sourceConnectionString,
                sourceAccountName: options.sourceAccountName,
                sourceAccountKey: options.sourceAccountKey,
                sourceSasToken: options.sourceSasToken,
                destinationConnectionString: options.destinationConnectionString,
                destinationAccountName: options.destinationAccountName,
                destinationAccountKey: options.destinationAccountKey,
                destinationSasToken: options.destinationSasToken,
                includeBlobs: options.includeBlobs,
                includeFiles: options.includeFiles,
                includeQueues: options.includeQueues,
                includeTables: options.includeTables,
                overwrite: options.overwrite,
                skipExisting: options.skipExisting,
                continueOnError: options.continueOnError !== false,
                preserveMetadata: options.preserveMetadata,
                preserveAccessTier: options.preserveAccessTier,
                containerFilter: options.containerFilter,
                blobPrefix: options.blobPrefix,
                excludePatterns: options.excludePatterns,
                batchSize: options.batchSize,
                maxConcurrency: options.maxConcurrency,
                maxRetries: options.maxRetries
            });
            
            spinner.stop();
            
            const migrator = new StorageMigrator(config);
            const result = await migrator.migrate();
            
            if (result.success) {
                console.log(chalk.green('\n🎉 Migration completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠️ Migration completed with errors'));
            }
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Migration failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('list')
    .description('List available storage services in source account')
    .option('-s, --source-connection-string <string>', 'Source storage account connection string')
    .option('--source-account-name <name>', 'Source storage account name')
    .option('--source-account-key <key>', 'Source storage account key')
    .option('--source-sas-token <token>', 'Source storage account SAS token')
    .option('--include-blobs', 'List blob containers (default: true)', true)
    .option('--include-files', 'List file shares')
    .option('--include-queues', 'List queues')
    .option('--include-tables', 'List tables')
    .action(async (options) => {
        const spinner = ora('Listing storage services...').start();
        
        try {
            const config = new StorageConfig({
                sourceConnectionString: options.sourceConnectionString,
                sourceAccountName: options.sourceAccountName,
                sourceAccountKey: options.sourceAccountKey,
                sourceSasToken: options.sourceSasToken,
                // Dummy destination for validation
                destinationConnectionString: 'DefaultEndpointsProtocol=https;AccountName=dummy;AccountKey=dummy;EndpointSuffix=core.windows.net',
                includeBlobs: options.includeBlobs,
                includeFiles: options.includeFiles,
                includeQueues: options.includeQueues,
                includeTables: options.includeTables
            });
            
            // Override validation for listing
            config.validate = () => {
                if (!config.sourceConnectionString && (!config.sourceAccountName || (!config.sourceAccountKey && !config.sourceSasToken))) {
                    throw new Error('Source storage account credentials are required');
                }
            };
            
            spinner.stop();
            
            const migrator = new StorageMigrator(config);
            await migrator.listStorageServices();
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Failed to list storage services: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('copy')
    .description('Copy specific containers from source to destination')
    .argument('<containers...>', 'Container names to copy')
    .option('-s, --source-connection-string <string>', 'Source storage account connection string')
    .option('--source-account-name <name>', 'Source storage account name')
    .option('--source-account-key <key>', 'Source storage account key')
    .option('--source-sas-token <token>', 'Source storage account SAS token')
    .option('-d, --destination-connection-string <string>', 'Destination storage account connection string')
    .option('--destination-account-name <name>', 'Destination storage account name')
    .option('--destination-account-key <key>', 'Destination storage account key')
    .option('--destination-sas-token <token>', 'Destination storage account SAS token')
    .option('--overwrite', 'Overwrite existing items in destination')
    .option('--skip-existing', 'Skip items that already exist in destination')
    .option('--continue-on-error', 'Continue migration even if some items fail (default: true)')
    .option('--preserve-metadata', 'Preserve item metadata (default: true)', true)
    .option('--preserve-access-tier', 'Preserve blob access tiers (default: true)', true)
    .option('--blob-prefix <prefix>', 'Only migrate blobs with this prefix')
    .option('--exclude-patterns <patterns>', 'Comma-separated patterns to exclude', (value) => value.split(','))
    .option('--batch-size <size>', 'Batch size for parallel operations (default: 10)', parseInt)
    .option('--max-retries <retries>', 'Maximum retry attempts for failed operations (default: 3)', parseInt)
    .action(async (containers, options) => {
        const spinner = ora('Initializing container copy...').start();
        
        try {
            const config = new StorageConfig({
                sourceConnectionString: options.sourceConnectionString,
                sourceAccountName: options.sourceAccountName,
                sourceAccountKey: options.sourceAccountKey,
                sourceSasToken: options.sourceSasToken,
                destinationConnectionString: options.destinationConnectionString,
                destinationAccountName: options.destinationAccountName,
                destinationAccountKey: options.destinationAccountKey,
                destinationSasToken: options.destinationSasToken,
                includeBlobs: true, // Always include blobs for container copy
                overwrite: options.overwrite,
                skipExisting: options.skipExisting,
                continueOnError: options.continueOnError !== false,
                preserveMetadata: options.preserveMetadata,
                preserveAccessTier: options.preserveAccessTier,
                blobPrefix: options.blobPrefix,
                excludePatterns: options.excludePatterns,
                batchSize: options.batchSize,
                maxRetries: options.maxRetries
            });
            
            spinner.stop();
            
            const migrator = new StorageMigrator(config);
            const result = await migrator.copyContainers(containers);
            
            if (result.failedBlobs === 0) {
                console.log(chalk.green('\n🎉 Container copy completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠️ Container copy completed with errors'));
            }
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Container copy failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('validate')
    .description('Validate storage account credentials and connectivity')
    .option('-s, --source-connection-string <string>', 'Source storage account connection string')
    .option('--source-account-name <name>', 'Source storage account name')
    .option('--source-account-key <key>', 'Source storage account key')
    .option('--source-sas-token <token>', 'Source storage account SAS token')
    .option('-d, --destination-connection-string <string>', 'Destination storage account connection string')
    .option('--destination-account-name <name>', 'Destination storage account name')
    .option('--destination-account-key <key>', 'Destination storage account key')
    .option('--destination-sas-token <token>', 'Destination storage account SAS token')
    .action(async (options) => {
        const spinner = ora('Validating credentials...').start();
        
        try {
            const config = new StorageConfig({
                sourceConnectionString: options.sourceConnectionString,
                sourceAccountName: options.sourceAccountName,
                sourceAccountKey: options.sourceAccountKey,
                sourceSasToken: options.sourceSasToken,
                destinationConnectionString: options.destinationConnectionString,
                destinationAccountName: options.destinationAccountName,
                destinationAccountKey: options.destinationAccountKey,
                destinationSasToken: options.destinationSasToken,
                includeBlobs: true // Enable blobs for validation
            });
            
            config.validate();
            
            spinner.text = 'Testing source account connectivity...';
            const migrator = new StorageMigrator(config);
            
            // Test source connectivity
            await migrator.blobMigrator.listContainers();
            console.log(chalk.green('✅ Source account connectivity: OK'));
            
            spinner.text = 'Testing destination account connectivity...';
            // Test destination connectivity by trying to list containers
            const destinationClient = migrator.blobMigrator.destinationClient;
            const containerIter = destinationClient.listContainers();
            await containerIter.next();
            
            spinner.stop();
            console.log(chalk.green('✅ Destination account connectivity: OK'));
            console.log(chalk.green('\n🎉 All credentials and connectivity validated successfully!'));
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Validation failed: ${error.message}`));
            process.exit(1);
        }
    });

// Handle unknown commands
program.on('command:*', () => {
    console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
    process.exit(1);
});

program.parse();
