/**
 * Schema creation in local Cosmos DB emulator
 */

import { CosmosClient } from '@azure/cosmos';
import fs from 'fs/promises';
import { DatabaseSchema, ContainerSchema } from './schema-extractor.js';

export class SchemaCreator {
    constructor(endpoint, key) {
        this.client = new CosmosClient({ endpoint, key });
    }

    /**
     * Create database and all containers from schema
     */
    async createDatabaseSchema(schema, overwrite = false) {
        console.log(`Creating database schema: ${schema.name}`);
        
        try {
            // Create or get database
            if (overwrite && await this._databaseExists(schema.name)) {
                console.log(`Deleting existing database: ${schema.name}`);
                await this.client.database(schema.name).delete();
            }
            
            // Create database with throughput if specified
            const databaseOptions = { id: schema.name };
            if (schema.throughput) {
                databaseOptions.throughput = schema.throughput;
                console.log(`Creating database '${schema.name}' with ${schema.throughput} RU/s`);
            } else {
                console.log(`Creating database '${schema.name}' without dedicated throughput`);
            }
            
            const { database } = await this.client.databases.createIfNotExists(databaseOptions);
            
            // Create containers
            for (const containerSchema of schema.containers) {
                await this._createContainer(database, containerSchema, overwrite);
            }
            
            console.log(`Successfully created database schema with ${schema.containers.length} containers`);
            
        } catch (error) {
            if (error.code === 409 && !overwrite) {
                console.warn(`Database '${schema.name}' already exists. Use overwrite=true to replace it.`);
                // Still try to create missing containers
                const database = this.client.database(schema.name);
                for (const containerSchema of schema.containers) {
                    await this._createContainer(database, containerSchema, overwrite);
                }
            } else {
                console.error(`Error creating database schema: ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Create a single container from schema
     */
    async _createContainer(database, containerSchema, overwrite = false) {
        console.log(`Creating container: ${containerSchema.name}`);
        
        try {
            // Check if container exists
            if (overwrite && await this._containerExists(database, containerSchema.name)) {
                console.log(`Deleting existing container: ${containerSchema.name}`);
                await database.container(containerSchema.name).delete();
            }
            
            // Prepare container creation parameters
            const containerOptions = {
                id: containerSchema.name,
                partitionKey: {
                    paths: [containerSchema.partitionKeyPath],
                    kind: containerSchema.partitionKeyKind
                }
            };
            
            // Add optional parameters
            if (containerSchema.indexingPolicy) {
                containerOptions.indexingPolicy = containerSchema.indexingPolicy;
            }
            
            if (containerSchema.uniqueKeyPolicy) {
                containerOptions.uniqueKeyPolicy = containerSchema.uniqueKeyPolicy;
            }
            
            if (containerSchema.conflictResolutionPolicy) {
                containerOptions.conflictResolutionPolicy = containerSchema.conflictResolutionPolicy;
            }
            
            if (containerSchema.analyticalStorageTtl !== null) {
                containerOptions.analyticalStorageTtl = containerSchema.analyticalStorageTtl;
            }
            
            if (containerSchema.defaultTtl !== null) {
                containerOptions.defaultTtl = containerSchema.defaultTtl;
            }
            
            // Add throughput if specified
            if (containerSchema.throughput) {
                containerOptions.throughput = containerSchema.throughput;
            }
            
            // Create container
            const { container } = await database.containers.createIfNotExists(containerOptions);
            
            const throughputInfo = containerSchema.throughput ? ` with ${containerSchema.throughput} RU/s` : ' without dedicated throughput';
            console.log(`Created container '${containerSchema.name}'${throughputInfo}`);
            
            // Create User Defined Functions, Stored Procedures, and Triggers
            await this._createUserDefinedFunctions(container, containerSchema.userDefinedFunctions);
            await this._createStoredProcedures(container, containerSchema.storedProcedures);
            await this._createTriggers(container, containerSchema.triggers);
            
        } catch (error) {
            if (error.code === 409 && !overwrite) {
                console.warn(`Container '${containerSchema.name}' already exists. Use overwrite=true to replace it.`);
            } else {
                console.error(`Error creating container '${containerSchema.name}': ${error.message}`);
                throw error;
            }
        }
    }

    /**
     * Check if database exists
     */
    async _databaseExists(databaseName) {
        try {
            await this.client.database(databaseName).read();
            return true;
        } catch (error) {
            if (error.code === 404) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Check if container exists
     */
    async _containerExists(database, containerName) {
        try {
            await database.container(containerName).read();
            return true;
        } catch (error) {
            if (error.code === 404) {
                return false;
            }
            throw error;
        }
    }

    /**
     * Load schema from JSON file
     */
    async loadSchemaFromJson(filePath) {
        console.log(`Loading schema from: ${filePath}`);
        
        const schemaJson = await fs.readFile(filePath, 'utf-8');
        const schemaData = JSON.parse(schemaJson);
        
        // Convert containers array to ContainerSchema objects
        const containers = schemaData.containers.map(containerData => 
            new ContainerSchema(containerData)
        );
        
        const schema = new DatabaseSchema({
            name: schemaData.name,
            throughput: schemaData.throughput,
            containers
        });
        
        console.log('Schema loaded successfully');
        return schema;
    }

    /**
     * Verify that the schema was created correctly
     */
    async verifySchema(schema) {
        console.log(`Verifying schema for database: ${schema.name}`);
        
        const verificationResult = {
            databaseExists: false,
            containers: {},
            errors: []
        };
        
        try {
            // Check database
            const database = this.client.database(schema.name);
            await database.read();
            verificationResult.databaseExists = true;
            
            // Check each container
            for (const containerSchema of schema.containers) {
                const containerName = containerSchema.name;
                verificationResult.containers[containerName] = {
                    exists: false,
                    partitionKeyMatches: false,
                    throughputMatches: false
                };
                
                try {
                    const container = database.container(containerName);
                    const { resource: properties } = await container.read();
                    
                    verificationResult.containers[containerName].exists = true;
                    
                    // Check partition key
                    const actualPartitionKey = properties.partitionKey?.paths?.[0] || '/id';
                    if (actualPartitionKey === containerSchema.partitionKeyPath) {
                        verificationResult.containers[containerName].partitionKeyMatches = true;
                    }
                    
                    // Check throughput (if applicable)
                    if (containerSchema.throughput) {
                        try {
                            const { resource: offer } = await container.readOffer();
                            const actualThroughput = offer?.content?.offerThroughput;
                            if (actualThroughput === containerSchema.throughput) {
                                verificationResult.containers[containerName].throughputMatches = true;
                            }
                        } catch (error) {
                            // Ignore throughput verification errors
                        }
                    } else {
                        verificationResult.containers[containerName].throughputMatches = true;
                    }
                    
                } catch (error) {
                    if (error.code === 404) {
                        verificationResult.errors.push(`Container '${containerName}' not found`);
                    } else {
                        verificationResult.errors.push(`Error verifying container '${containerName}': ${error.message}`);
                    }
                }
            }
            
        } catch (error) {
            if (error.code === 404) {
                verificationResult.errors.push(`Database '${schema.name}' not found`);
            } else {
                verificationResult.errors.push(`Error verifying database: ${error.message}`);
            }
        }
        
        return verificationResult;
    }

    /**
     * Create User Defined Functions in a container
     */
    async _createUserDefinedFunctions(container, udfs) {
        if (!udfs || udfs.length === 0) {
            return;
        }

        console.log(`Creating ${udfs.length} User Defined Functions...`);
        
        for (const udf of udfs) {
            try {
                await container.scripts.userDefinedFunctions.create({
                    id: udf.id,
                    body: udf.body
                });
                console.log(`  ✅ Created UDF: ${udf.id}`);
            } catch (error) {
                if (error.code === 409) {
                    console.warn(`  ⚠️ UDF '${udf.id}' already exists`);
                } else {
                    console.error(`  ❌ Failed to create UDF '${udf.id}': ${error.message}`);
                    throw error;
                }
            }
        }
    }

    /**
     * Create Stored Procedures in a container
     */
    async _createStoredProcedures(container, sprocs) {
        if (!sprocs || sprocs.length === 0) {
            return;
        }

        console.log(`Creating ${sprocs.length} Stored Procedures...`);
        
        for (const sproc of sprocs) {
            try {
                await container.scripts.storedProcedures.create({
                    id: sproc.id,
                    body: sproc.body
                });
                console.log(`  ✅ Created Stored Procedure: ${sproc.id}`);
            } catch (error) {
                if (error.code === 409) {
                    console.warn(`  ⚠️ Stored Procedure '${sproc.id}' already exists`);
                } else {
                    console.error(`  ❌ Failed to create Stored Procedure '${sproc.id}': ${error.message}`);
                    throw error;
                }
            }
        }
    }

    /**
     * Create Triggers in a container
     */
    async _createTriggers(container, triggers) {
        if (!triggers || triggers.length === 0) {
            return;
        }

        console.log(`Creating ${triggers.length} Triggers...`);
        
        for (const trigger of triggers) {
            try {
                await container.scripts.triggers.create({
                    id: trigger.id,
                    body: trigger.body,
                    triggerOperation: trigger.triggerOperation,
                    triggerType: trigger.triggerType
                });
                console.log(`  ✅ Created Trigger: ${trigger.id}`);
            } catch (error) {
                if (error.code === 409) {
                    console.warn(`  ⚠️ Trigger '${trigger.id}' already exists`);
                } else {
                    console.error(`  ❌ Failed to create Trigger '${trigger.id}': ${error.message}`);
                    throw error;
                }
            }
        }
    }
}
