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
        defaultTtl = null
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
            
            return new ContainerSchema({
                name: containerName,
                partitionKeyPath,
                partitionKeyKind,
                throughput,
                indexingPolicy,
                uniqueKeyPolicy,
                conflictResolutionPolicy,
                analyticalStorageTtl,
                defaultTtl
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
