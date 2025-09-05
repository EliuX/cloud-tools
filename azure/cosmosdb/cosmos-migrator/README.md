# Cosmos DB Schema Migrator

A Node.js tool to migrate Cosmos DB database schemas from Azure to a local Cosmos DB emulator. This tool extracts the complete schema structure including databases, containers, partition keys, indexing policies, and throughput settings.

## Features

- **Schema Extraction**: Extract complete database schema from Azure Cosmos DB
- **Schema Creation**: Recreate schema structure in local Cosmos DB emulator
- **Full Migration**: End-to-end migration from Azure to emulator
- **Verification**: Verify that migration completed successfully
- **CLI Interface**: Easy-to-use command line interface
- **Configuration**: Flexible configuration via environment variables or CLI options

## Prerequisites

- Node.js 16+ 
- Azure Cosmos DB account with access credentials
- Local Cosmos DB emulator running (for schema creation)

## Installation

1. Clone or download this tool
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment template:
   ```bash
   cp .env.example .env
   ```

4. Configure your Azure Cosmos DB credentials in `.env`:
   ```env
   AZURE_COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
   AZURE_COSMOS_KEY=your-azure-cosmos-key
   AZURE_COSMOS_DATABASE=your-database-name
   ```

## Usage

### Complete Migration

Migrate schema from Azure to local emulator:

```bash
node cli.js migrate
```

With CLI options:
```bash
node cli.js migrate \
  --azure-endpoint "https://your-account.documents.azure.com:443/" \
  --azure-key "your-key" \
  --azure-database "your-db" \
  --overwrite
```

### Extract Schema Only

Extract schema from Azure and save to JSON file:

```bash
node cli.js extract --output my-schema.json
```

### Create Schema from File

Create schema in emulator from previously extracted JSON file:

```bash
node cli.js create my-schema.json --overwrite
```

### List Available Databases

List all databases in your Azure Cosmos DB account:

```bash
node cli.js list
```

## CLI Commands

### `migrate`
Perform complete migration from Azure to emulator.

**Options:**
- `-e, --azure-endpoint <endpoint>` - Azure Cosmos DB endpoint
- `-k, --azure-key <key>` - Azure Cosmos DB key  
- `-d, --azure-database <database>` - Azure database name
- `--emulator-endpoint <endpoint>` - Emulator endpoint (default: https://localhost:8081)
- `--emulator-key <key>` - Emulator key (default: emulator default)
- `--emulator-database <database>` - Emulator database name (default: same as Azure)
- `--overwrite` - Overwrite existing database/containers
- `--include-data` - Include data migration (not implemented yet)

### `extract`
Extract schema from Azure Cosmos DB.

**Options:**
- `-e, --azure-endpoint <endpoint>` - Azure Cosmos DB endpoint
- `-k, --azure-key <key>` - Azure Cosmos DB key
- `-d, --azure-database <database>` - Azure database name
- `-o, --output <file>` - Output file name

### `create`
Create schema in emulator from JSON file.

**Arguments:**
- `<schema-file>` - Path to schema JSON file

**Options:**
- `--emulator-endpoint <endpoint>` - Emulator endpoint
- `--emulator-key <key>` - Emulator key
- `--emulator-database <database>` - Override database name
- `--overwrite` - Overwrite existing database/containers

### `list`
List available databases in Azure Cosmos DB.

**Options:**
- `-e, --azure-endpoint <endpoint>` - Azure Cosmos DB endpoint
- `-k, --azure-key <key>` - Azure Cosmos DB key

## Configuration

### Environment Variables

Create a `.env` file with the following variables:

```env
# Azure Cosmos DB (Source)
AZURE_COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
AZURE_COSMOS_KEY=your-azure-cosmos-key
AZURE_COSMOS_DATABASE=your-database-name

# Local Emulator (Destination)  
EMULATOR_ENDPOINT=https://localhost:8081
EMULATOR_KEY=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw==
EMULATOR_DATABASE=your-emulator-database-name

# Migration Options
INCLUDE_DATA=false
BATCH_SIZE=100
MAX_RETRIES=3
OVERWRITE=false
```

### Programmatic Usage

You can also use the migrator programmatically:

```javascript
import { CosmosMigrator } from './migrator.js';
import { CosmosConfig } from './config.js';

const config = new CosmosConfig({
    azureEndpoint: 'https://your-account.documents.azure.com:443/',
    azureKey: 'your-key',
    azureDatabaseName: 'your-database',
    overwrite: true
});

const migrator = new CosmosMigrator(config);

// Complete migration
const result = await migrator.migrate();

// Or extract schema only
const schema = await migrator.extractSchema('schema.json');

// Or create from file
await migrator.createSchemaFromFile('schema.json');
```

## Schema Structure

The tool extracts and recreates the following schema elements:

### Database Level
- Database name
- Shared throughput (RU/s) if configured

### Container Level
- Container name
- Partition key path and kind
- Dedicated throughput (RU/s) if configured
- Indexing policy
- Unique key policy
- Conflict resolution policy
- Analytical storage TTL
- Default TTL

### Example Schema JSON

```json
{
  "name": "MyDatabase",
  "throughput": null,
  "containers": [
    {
      "name": "Users",
      "partitionKeyPath": "/userId",
      "partitionKeyKind": "Hash",
      "throughput": 400,
      "indexingPolicy": {
        "indexingMode": "consistent",
        "automatic": true,
        "includedPaths": [{"path": "/*"}],
        "excludedPaths": [{"path": "/\"_etag\"/?"}]
      },
      "uniqueKeyPolicy": null,
      "conflictResolutionPolicy": null,
      "analyticalStorageTtl": null,
      "defaultTtl": null
    }
  ]
}
```

## Local Cosmos DB Emulator Setup

1. Download and install the [Azure Cosmos DB Emulator](https://docs.microsoft.com/en-us/azure/cosmos-db/local-emulator)

2. Start the emulator:
   ```bash
   # Windows
   CosmosDB.Emulator.exe

   # Or use Docker
   docker run -p 8081:8081 -p 10251:10251 -p 10252:10252 -p 10253:10253 -p 10254:10254 -m 3g --cpus=2.0 --name=test-linux-emulator mcr.microsoft.com/cosmosdb/linux/azure-cosmos-emulator
   ```

3. The emulator will be available at `https://localhost:8081`

## Troubleshooting

### Common Issues

**SSL Certificate Issues with Emulator:**
```bash
# Set environment variable to ignore SSL errors (development only)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

**Permission Errors:**
- Ensure your Azure Cosmos DB key has read permissions
- For emulator, use the default key provided in the example

**Network Connectivity:**
- Verify emulator is running and accessible
- Check firewall settings for port 8081

### Error Messages

- `Database 'name' not found` - Check database name and Azure credentials
- `Container 'name' already exists` - Use `--overwrite` flag to replace existing containers
- `SSL certificate problem` - See SSL certificate issues above

## Limitations

- Data migration is not yet implemented (schema only)
- Stored procedures, triggers, and UDFs are not migrated
- Some advanced indexing configurations may need manual adjustment
- Cross-region replication settings are not applicable to emulator

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License
