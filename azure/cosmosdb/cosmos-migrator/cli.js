#!/usr/bin/env node

/**
 * Command Line Interface for Cosmos DB Migration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { CosmosMigrator } from './migrator.js';
import { CosmosConfig } from './config.js';

const program = new Command();

program
    .name('cosmos-migrator')
    .description('Migrate Cosmos DB schema from Azure to local emulator')
    .version('1.0.0');

program
    .command('migrate')
    .description('Perform complete migration from Azure to emulator')
    .option('-e, --azure-endpoint <endpoint>', 'Azure Cosmos DB endpoint')
    .option('-k, --azure-key <key>', 'Azure Cosmos DB key')
    .option('-d, --azure-database <database>', 'Azure Cosmos DB database name')
    .option('--emulator-endpoint <endpoint>', 'Emulator endpoint (default: https://localhost:8081)')
    .option('--emulator-key <key>', 'Emulator key (default: emulator default key)')
    .option('--emulator-database <database>', 'Emulator database name (default: same as Azure)')
    .option('--overwrite', 'Overwrite existing database/containers')
    .option('--include-data', 'Include data migration')
    .option('--skip-existing', 'Skip documents that already exist in target')
    .option('--continue-on-error', 'Continue migration even if some documents fail (default: true)')
    .action(async (options) => {
        const spinner = ora('Initializing migration...').start();
        
        try {
            const config = new CosmosConfig({
                azureEndpoint: options.azureEndpoint,
                azureKey: options.azureKey,
                azureDatabaseName: options.azureDatabase,
                emulatorEndpoint: options.emulatorEndpoint,
                emulatorKey: options.emulatorKey,
                emulatorDatabaseName: options.emulatorDatabase,
                overwrite: options.overwrite,
                includeData: options.includeData,
                skipExisting: options.skipExisting,
                continueOnError: options.continueOnError !== false
            });
            
            spinner.stop();
            
            const migrator = new CosmosMigrator(config);
            const result = await migrator.migrate();
            
            console.log(chalk.green('\n🎉 Migration completed successfully!'));
            console.log(chalk.blue(`Schema file: ${result.schemaFile}`));
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Migration failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('extract')
    .description('Extract schema from Azure Cosmos DB')
    .option('-e, --azure-endpoint <endpoint>', 'Azure Cosmos DB endpoint')
    .option('-k, --azure-key <key>', 'Azure Cosmos DB key')
    .option('-d, --azure-database <database>', 'Azure Cosmos DB database name')
    .option('-o, --output <file>', 'Output file name')
    .action(async (options) => {
        const spinner = ora('Extracting schema...').start();
        
        try {
            const config = new CosmosConfig({
                azureEndpoint: options.azureEndpoint,
                azureKey: options.azureKey,
                azureDatabaseName: options.azureDatabase
            });
            
            spinner.stop();
            
            const migrator = new CosmosMigrator(config);
            const result = await migrator.extractSchema(options.output);
            
            console.log(chalk.green('\n✅ Schema extracted successfully!'));
            console.log(chalk.blue(`Schema file: ${result.schemaFile}`));
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Schema extraction failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('create')
    .description('Create schema in emulator from JSON file')
    .argument('<schema-file>', 'Schema JSON file')
    .option('--emulator-endpoint <endpoint>', 'Emulator endpoint (default: https://localhost:8081)')
    .option('--emulator-key <key>', 'Emulator key (default: emulator default key)')
    .option('--emulator-database <database>', 'Override emulator database name')
    .option('--overwrite', 'Overwrite existing database/containers')
    .action(async (schemaFile, options) => {
        const spinner = ora('Creating schema...').start();
        
        try {
            const config = new CosmosConfig({
                emulatorEndpoint: options.emulatorEndpoint,
                emulatorKey: options.emulatorKey,
                emulatorDatabaseName: options.emulatorDatabase,
                overwrite: options.overwrite
            });
            
            spinner.stop();
            
            const migrator = new CosmosMigrator(config);
            await migrator.createSchemaFromFile(schemaFile);
            
            console.log(chalk.green('\n✅ Schema created successfully!'));
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Schema creation failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('migrate-data')
    .description('Migrate data only (schema must already exist in target)')
    .option('-e, --azure-endpoint <endpoint>', 'Azure Cosmos DB endpoint')
    .option('-k, --azure-key <key>', 'Azure Cosmos DB key')
    .option('-d, --azure-database <database>', 'Azure Cosmos DB database name')
    .option('--emulator-endpoint <endpoint>', 'Emulator endpoint (default: https://localhost:8081)')
    .option('--emulator-key <key>', 'Emulator key (default: emulator default key)')
    .option('--emulator-database <database>', 'Emulator database name (default: same as Azure)')
    .option('--skip-existing', 'Skip documents that already exist in target')
    .option('--batch-size <size>', 'Batch size for data migration (default: 100)', parseInt)
    .option('--max-retries <retries>', 'Maximum retry attempts for failed operations (default: 3)', parseInt)
    .action(async (options) => {
        const spinner = ora('Initializing data migration...').start();
        
        try {
            const config = new CosmosConfig({
                azureEndpoint: options.azureEndpoint,
                azureKey: options.azureKey,
                azureDatabaseName: options.azureDatabase,
                emulatorEndpoint: options.emulatorEndpoint,
                emulatorKey: options.emulatorKey,
                emulatorDatabaseName: options.emulatorDatabase,
                batchSize: options.batchSize,
                maxRetries: options.maxRetries
            });
            
            spinner.stop();
            
            const migrator = new CosmosMigrator(config);
            const result = await migrator.dataMigrator.migrateDatabase(
                config.azureDatabaseName,
                config.emulatorDatabaseName
            );
            
            if (result.success) {
                console.log(chalk.green('\n🎉 Data migration completed successfully!'));
            } else {
                console.log(chalk.yellow('\n⚠️ Data migration completed with errors'));
            }
            
            console.log(chalk.blue(`Migrated: ${result.stats.migratedDocuments}/${result.stats.totalDocuments} documents`));
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Data migration failed: ${error.message}`));
            process.exit(1);
        }
    });

program
    .command('list')
    .description('List available databases in Azure Cosmos DB')
    .option('-e, --azure-endpoint <endpoint>', 'Azure Cosmos DB endpoint')
    .option('-k, --azure-key <key>', 'Azure Cosmos DB key')
    .action(async (options) => {
        const spinner = ora('Listing databases...').start();
        
        try {
            const config = new CosmosConfig({
                azureEndpoint: options.azureEndpoint,
                azureKey: options.azureKey,
                azureDatabaseName: 'dummy' // Not used for listing
            });
            
            // Override validation for listing
            config.validate = () => {
                if (!config.azureEndpoint || !config.azureKey) {
                    throw new Error('Azure endpoint and key are required for listing databases');
                }
            };
            
            spinner.stop();
            
            const migrator = new CosmosMigrator(config);
            await migrator.listDatabases();
            
        } catch (error) {
            spinner.stop();
            console.error(chalk.red(`\n❌ Failed to list databases: ${error.message}`));
            process.exit(1);
        }
    });

// Handle unknown commands
program.on('command:*', () => {
    console.error(chalk.red('Invalid command: %s\nSee --help for a list of available commands.'), program.args.join(' '));
    process.exit(1);
});

program.parse();
