/**
 * Schema extraction from Azure Cosmos DB
 */

import { CosmosClient } from '@azure/cosmos';
import fs from 'fs/promises';

export class ContainerSchema {
    constructor({
        name,
        partitionKeyPath,
        partitionKeyKind = 'Hash',
        throughput = null,
        indexingPolicy = null,
        uniqueKeyPolicy = null,
        conflictResolutionPolicy = null,
        analyticalStorageTtl = null,
        defaultTtl = null,
        userDefinedFunctions = [],
        storedProcedures = [],
        triggers = []
    }) {
        this.name = name;
        this.partitionKeyPath = partitionKeyPath;
        this.partitionKeyKind = partitionKeyKind;
        this.throughput = throughput;
        this.indexingPolicy = indexingPolicy;
        this.uniqueKeyPolicy = uniqueKeyPolicy;
        this.conflictResolutionPolicy = conflictResolutionPolicy;
        this.analyticalStorageTtl = analyticalStorageTtl;
        this.defaultTtl = defaultTtl;
        this.userDefinedFunctions = userDefinedFunctions;
        this.storedProcedures = storedProcedures;
        this.triggers = triggers;
    }
}

export class DatabaseSchema {
    constructor({ name, throughput = null, containers = [] }) {
        this.name = name;
        this.throughput = throughput;
        this.containers = containers;
    }
}

export class SchemaExtractor {
    constructor(endpoint, key) {
        this.client = new CosmosClient({ endpoint, key });
    }

    /**
     * Extract complete schema for a database
     */
    async extractDatabaseSchema(databaseName) {
        console.log(`Extracting schema for database: ${databaseName}`);
        
        try {
            // Get database reference
            const database = this.client.database(databaseName);
            
            // Get database properties and throughput
            const databaseThroughput = await this._getDatabaseThroughput(database);
            
            // Create database schema
            const dbSchema = new DatabaseSchema({
                name: databaseName,
                throughput: databaseThroughput
            });
            
            // Extract container schemas
            const { resources: containers } = await database.containers.readAll().fetchAll();
            
            for (const containerInfo of containers) {
                const containerSchema = await this._extractContainerSchema(database, containerInfo.id);
                dbSchema.containers.push(containerSchema);
            }
            
            console.log(`Successfully extracted schema for ${dbSchema.containers.length} containers`);
            return dbSchema;
            
        } catch (error) {
            if (error.code === 404) {
                throw new Error(`Database '${databaseName}' not found`);
            }
            console.error(`Error extracting database schema: ${error.message}`);
            throw error;
        }
    }

    /**
     * Extract schema for a specific container
     */
    async _extractContainerSchema(database, containerName) {
        console.log(`Extracting schema for container: ${containerName}`);
        
        try {
            const container = database.container(containerName);
            const { resource: properties } = await container.read();
            
            // Extract partition key information
            const partitionKey = properties.partitionKey || {};
            const partitionKeyPath = partitionKey.paths ? partitionKey.paths[0] : '/id';
            const partitionKeyKind = partitionKey.kind || 'Hash';
            
            // Get container throughput
            const throughput = await this._getContainerThroughput(container);
            
            // Extract other properties
            const indexingPolicy = properties.indexingPolicy;
            const uniqueKeyPolicy = properties.uniqueKeyPolicy;
            const conflictResolutionPolicy = properties.conflictResolutionPolicy;
            const analyticalStorageTtl = properties.analyticalStorageTtl;
            const defaultTtl = properties.defaultTtl;
            
            // Extract User Defined Functions, Stored Procedures, and Triggers
            const userDefinedFunctions = await this._extractUserDefinedFunctions(container);
            const storedProcedures = await this._extractStoredProcedures(container);
            const triggers = await this._extractTriggers(container);
            
            return new ContainerSchema({
                name: containerName,
                partitionKeyPath,
                partitionKeyKind,
                throughput,
                indexingPolicy,
                uniqueKeyPolicy,
                conflictResolutionPolicy,
                analyticalStorageTtl,
                defaultTtl,
                userDefinedFunctions,
                storedProcedures,
                triggers
            });
            
        } catch (error) {
            console.error(`Error extracting container schema for '${containerName}': ${error.message}`);
            throw error;
        }
    }

    /**
     * Get database-level throughput if configured
     */
    async _getDatabaseThroughput(database) {
        try {
            const { resource: offer } = await database.readOffer();
            return offer?.content?.offerThroughput || null;
        } catch (error) {
            if (error.code === 404) {
                // Database doesn't have dedicated throughput
                return null;
            }
            console.warn(`Could not read database throughput: ${error.message}`);
            return null;
        }
    }

    /**
     * Get container-level throughput if configured
     */
    async _getContainerThroughput(container) {
        try {
            const { resource: offer } = await container.readOffer();
            return offer?.content?.offerThroughput || null;
        } catch (error) {
            if (error.code === 404) {
                // Container doesn't have dedicated throughput
                return null;
            }
            console.warn(`Could not read container throughput: ${error.message}`);
            return null;
        }
    }

    /**
     * Export schema to JSON file
     */
    async exportSchemaToJson(schema, filePath) {
        console.log(`Exporting schema to: ${filePath}`);
        
        const schemaJson = JSON.stringify(schema, null, 2);
        await fs.writeFile(filePath, schemaJson, 'utf-8');
        
        console.log('Schema exported successfully');
    }

    /**
     * Extract User Defined Functions from a container
     */
    async _extractUserDefinedFunctions(container) {
        try {
            const { resources: udfs } = await container.scripts.userDefinedFunctions.readAll().fetchAll();
            return udfs.map(udf => ({
                id: udf.id,
                body: udf.body
            }));
        } catch (error) {
            console.warn(`Could not extract UDFs: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract Stored Procedures from a container
     */
    async _extractStoredProcedures(container) {
        try {
            const { resources: sprocs } = await container.scripts.storedProcedures.readAll().fetchAll();
            return sprocs.map(sproc => ({
                id: sproc.id,
                body: sproc.body
            }));
        } catch (error) {
            console.warn(`Could not extract stored procedures: ${error.message}`);
            return [];
        }
    }

    /**
     * Extract Triggers from a container
     */
    async _extractTriggers(container) {
        try {
            const { resources: triggers } = await container.scripts.triggers.readAll().fetchAll();
            return triggers.map(trigger => ({
                id: trigger.id,
                body: trigger.body,
                triggerOperation: trigger.triggerOperation,
                triggerType: trigger.triggerType
            }));
        } catch (error) {
            console.warn(`Could not extract triggers: ${error.message}`);
            return [];
        }
    }

    /**
     * List all databases in the Cosmos DB account
     */
    async listDatabases() {
        try {
            const { resources: databases } = await this.client.databases.readAll().fetchAll();
            return databases.map(db => db.id);
        } catch (error) {
            console.error(`Error listing databases: ${error.message}`);
            throw error;
        }
    }
}
