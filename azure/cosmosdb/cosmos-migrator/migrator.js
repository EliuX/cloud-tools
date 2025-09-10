/**
 * Main migration orchestrator
 */

import { SchemaExtractor } from './schema-extractor.js';
import { SchemaCreator } from './schema-creator.js';
import { DataMigrator } from './data-migrator.js';
import { CosmosConfig } from './config.js';

export class CosmosMigrator {
    constructor(config) {
        this.config = config;
        this.extractor = new SchemaExtractor(
            config.azureEndpoint,
            config.azureKey
        );
        this.creator = new SchemaCreator(
            config.emulatorEndpoint,
            config.emulatorKey
        );
        this.dataMigrator = new DataMigrator(
            config.azureEndpoint,
            config.azureKey,
            config.emulatorEndpoint,
            config.emulatorKey,
            {
                batchSize: config.batchSize,
                maxRetries: config.maxRetries,
                continueOnError: config.continueOnError,
                skipExisting: config.skipExisting
            }
        );
    }

    /**
     * Perform complete migration from Azure to emulator
     */
    async migrate() {
        console.log('Starting Cosmos DB migration...');
        
        try {
            // Validate configuration
            this.config.validate();
            
            // Extract schema from Azure
            console.log('\n1. Extracting schema from Azure Cosmos DB...');
            const schema = await this.extractor.extractDatabaseSchema(this.config.azureDatabaseName);
            
            // Update database name for emulator if different
            if (this.config.emulatorDatabaseName !== this.config.azureDatabaseName) {
                schema.name = this.config.emulatorDatabaseName;
            }
            
            // Save schema to file
            const schemaFile = `${schema.name}-schema.json`;
            await this.extractor.exportSchemaToJson(schema, schemaFile);
            console.log(`Schema saved to: ${schemaFile}`);
            
            // Create schema in emulator
            console.log('\n2. Creating schema in local emulator...');
            await this.creator.createDatabaseSchema(schema, this.config.overwrite);
            
            // Verify migration
            console.log('\n3. Verifying migration...');
            const verification = await this.creator.verifySchema(schema);
            this._printVerificationResults(verification);
            
            let dataMigrationResult = null;
            
            // Migrate data if requested
            if (this.config.includeData) {
                console.log('\n4. Migrating data...');
                dataMigrationResult = await this.dataMigrator.migrateDatabase(
                    this.config.azureDatabaseName,
                    this.config.emulatorDatabaseName
                );
            }
            
            console.log('\n✅ Migration completed successfully!');
            
            return {
                success: true,
                schema,
                verification,
                schemaFile,
                dataMigration: dataMigrationResult
            };
            
        } catch (error) {
            console.error(`\n❌ Migration failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract schema only
     */
    async extractSchema(outputFile = null) {
        console.log('Extracting Cosmos DB schema...');
        
        try {
            this.config.validate();
            
            const schema = await this.extractor.extractDatabaseSchema(this.config.azureDatabaseName);
            
            const schemaFile = outputFile || `${schema.name}-schema.json`;
            await this.extractor.exportSchemaToJson(schema, schemaFile);
            
            console.log(`✅ Schema extracted and saved to: ${schemaFile}`);
            
            return { success: true, schema, schemaFile };
            
        } catch (error) {
            console.error(`❌ Schema extraction failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Create schema from file
     */
    async createSchemaFromFile(schemaFile) {
        console.log(`Creating schema from file: ${schemaFile}`);
        
        try {
            const schema = await this.creator.loadSchemaFromJson(schemaFile);
            
            // Update database name for emulator if different
            if (this.config.emulatorDatabaseName && this.config.emulatorDatabaseName !== schema.name) {
                schema.name = this.config.emulatorDatabaseName;
            }
            
            await this.creator.createDatabaseSchema(schema, this.config.overwrite);
            
            // Verify creation
            const verification = await this.creator.verifySchema(schema);
            this._printVerificationResults(verification);
            
            console.log('✅ Schema created successfully!');
            
            return { success: true, schema, verification };
            
        } catch (error) {
            console.error(`❌ Schema creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * List available databases
     */
    async listDatabases() {
        try {
            this.config.validate();
            
            console.log('Available databases in Azure Cosmos DB:');
            const databases = await this.extractor.listDatabases();
            
            databases.forEach((db, index) => {
                console.log(`  ${index + 1}. ${db}`);
            });
            
            return databases;
            
        } catch (error) {
            console.error(`❌ Failed to list databases: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract only User Defined Functions, Stored Procedures, and Triggers
     */
    async extractScripts(containerName = null, outputFile = null) {
        console.log('Extracting Cosmos DB scripts...');
        
        try {
            this.config.validate();
            
            const schema = await this.extractor.extractDatabaseSchema(this.config.azureDatabaseName);
            
            // Filter containers if specific container requested
            let containersToProcess = schema.containers;
            if (containerName) {
                containersToProcess = schema.containers.filter(c => c.name === containerName);
                if (containersToProcess.length === 0) {
                    throw new Error(`Container '${containerName}' not found in database '${this.config.azureDatabaseName}'`);
                }
            }
            
            // Extract scripts data
            const scriptsData = {
                databaseName: schema.name,
                extractedAt: new Date().toISOString(),
                containers: containersToProcess.map(container => ({
                    name: container.name,
                    userDefinedFunctions: container.userDefinedFunctions,
                    storedProcedures: container.storedProcedures,
                    triggers: container.triggers
                }))
            };
            
            // Calculate statistics
            const stats = {
                totalUDFs: containersToProcess.reduce((sum, c) => sum + c.userDefinedFunctions.length, 0),
                totalStoredProcedures: containersToProcess.reduce((sum, c) => sum + c.storedProcedures.length, 0),
                totalTriggers: containersToProcess.reduce((sum, c) => sum + c.triggers.length, 0)
            };
            
            const scriptsFile = outputFile || `${schema.name}-scripts.json`;
            await this.extractor.exportSchemaToJson(scriptsData, scriptsFile);
            
            console.log(`✅ Scripts extracted and saved to: ${scriptsFile}`);
            
            return { success: true, scriptsData, scriptsFile, stats };
            
        } catch (error) {
            console.error(`❌ Script extraction failed: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * Create scripts from file
     */
    async createScriptsFromFile(scriptsFile, containerName = null) {
        console.log(`Creating scripts from file: ${scriptsFile}`);
        
        try {
            const scriptsData = await this.creator.loadSchemaFromJson(scriptsFile);
            
            // Update database name for emulator if different
            const targetDatabaseName = this.config.emulatorDatabaseName || scriptsData.databaseName;
            
            const database = this.creator.client.database(targetDatabaseName);
            
            // Filter containers if specific container requested
            let containersToProcess = scriptsData.containers;
            if (containerName) {
                containersToProcess = scriptsData.containers.filter(c => c.name === containerName);
                if (containersToProcess.length === 0) {
                    throw new Error(`Container '${containerName}' not found in scripts file`);
                }
            }
            
            const stats = {
                createdUDFs: 0,
                createdStoredProcedures: 0,
                createdTriggers: 0
            };
            
            // Create scripts for each container
            for (const containerData of containersToProcess) {
                console.log(`\nProcessing container: ${containerData.name}`);
                
                const container = database.container(containerData.name);
                
                // Verify container exists
                try {
                    await container.read();
                } catch (error) {
                    if (error.code === 404) {
                        console.warn(`  ⚠️ Container '${containerData.name}' does not exist. Skipping...`);
                        continue;
                    }
                    throw error;
                }
                
                // Create UDFs
                if (containerData.userDefinedFunctions && containerData.userDefinedFunctions.length > 0) {
                    await this.creator._createUserDefinedFunctions(container, containerData.userDefinedFunctions);
                    stats.createdUDFs += containerData.userDefinedFunctions.length;
                }
                
                // Create Stored Procedures
                if (containerData.storedProcedures && containerData.storedProcedures.length > 0) {
                    await this.creator._createStoredProcedures(container, containerData.storedProcedures);
                    stats.createdStoredProcedures += containerData.storedProcedures.length;
                }
                
                // Create Triggers
                if (containerData.triggers && containerData.triggers.length > 0) {
                    await this.creator._createTriggers(container, containerData.triggers);
                    stats.createdTriggers += containerData.triggers.length;
                }
            }
            
            console.log('\n✅ Scripts created successfully!');
            
            return { success: true, stats };
            
        } catch (error) {
            console.error(`❌ Script creation failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Print verification results
     */
    _printVerificationResults(verification) {
        console.log('\nVerification Results:');
        console.log(`Database exists: ${verification.databaseExists ? '✅' : '❌'}`);
        
        if (Object.keys(verification.containers).length > 0) {
            console.log('\nContainers:');
            for (const [containerName, result] of Object.entries(verification.containers)) {
                console.log(`  ${containerName}:`);
                console.log(`    Exists: ${result.exists ? '✅' : '❌'}`);
                console.log(`    Partition Key: ${result.partitionKeyMatches ? '✅' : '❌'}`);
                console.log(`    Throughput: ${result.throughputMatches ? '✅' : '❌'}`);
            }
        }
        
        if (verification.errors.length > 0) {
            console.log('\nErrors:');
            verification.errors.forEach(error => {
                console.log(`  ❌ ${error}`);
            });
        }
    }
}
