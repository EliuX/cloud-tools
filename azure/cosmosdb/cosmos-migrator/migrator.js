/**
 * Main migration orchestrator
 */

import { SchemaExtractor } from './schema-extractor.js';
import { SchemaCreator } from './schema-creator.js';
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
            
            console.log('\n✅ Migration completed successfully!');
            
            return {
                success: true,
                schema,
                verification,
                schemaFile
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
