# Cosmos DB Schema Migrator

A Node.js tool to migrate Cosmos DB database schemas from Azure to a local Cosmos DB emulator. This tool extracts the complete schema structure including databases, containers, partition keys, indexing policies, and throughput settings.

## Features

- **Schema Extraction**: Extract complete database schema from Azure Cosmos DB
- **Schema Creation**: Recreate schema structure in local Cosmos DB emulator
- **Data Migration**: Migrate documents with error resilience and batch processing
- **Full Migration**: End-to-end migration from Azure to emulator (schema + data)
- **Error Resilience**: Continue migration even when individual operations fail
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

### Complete Migration (Schema Only)

Migrate schema from Azure to local emulator:

```bash
node cli.js migrate
```

### Complete Migration (Schema + Data)

Migrate both schema and data from Azure to local emulator:

```bash
node cli.js migrate --include-data --overwrite
```

With additional options:
```bash
node cli.js migrate \
  --include-data \
  --skip-existing \
  --overwrite \
  --batch-size 50
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

### Data Migration Only

Migrate data only (schema must already exist in target):

```bash
node cli.js migrate-data
```

With options for resilient migration:
```bash
node cli.js migrate-data \
  --skip-existing \
  --batch-size 100 \
  --max-retries 5
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
- `--include-data` - Include data migration
- `--skip-existing` - Skip documents that already exist in target
- `--continue-on-error` - Continue migration even if some documents fail (default: true)

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

### `migrate-data`
Migrate data only (schema must already exist in target).

**Options:**
- `-e, --azure-endpoint <endpoint>` - Azure Cosmos DB endpoint
- `-k, --azure-key <key>` - Azure Cosmos DB key
- `-d, --azure-database <database>` - Azure database name
- `--emulator-endpoint <endpoint>` - Emulator endpoint (default: https://localhost:8081)
- `--emulator-key <key>` - Emulator key (default: emulator default)
- `--emulator-database <database>` - Emulator database name (default: same as Azure)
- `--skip-existing` - Skip documents that already exist in target
- `--batch-size <size>` - Batch size for data migration (default: 100)
- `--max-retries <retries>` - Maximum retry attempts for failed operations (default: 3)

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
SKIP_EXISTING=false
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

## Debugging

### VS Code Debugging Setup

This project includes VS Code debugging configurations to help you debug migration executions. The configurations are located in the root `.vscode/launch.json` file and provide several debugging scenarios:

#### Available Debug Configurations

1. **Debug: Cosmos Migration (Full)** - Debug the complete migration process from Azure to emulator (schema only)
2. **Debug: Cosmos Extract Schema** - Debug schema extraction from Azure Cosmos DB
3. **Debug: Cosmos Create Schema** - Debug schema creation in the emulator from a JSON file
4. **Debug: Cosmos List Databases** - Debug the database listing functionality
5. **Debug: Cosmos Migration with Data** - Debug full migration including data migration
6. **Debug: Cosmos Data Migration Only** - Debug data-only migration with batch processing
7. **Debug: Cosmos Custom Arguments** - Debug with custom command-line arguments

#### Prerequisites for Debugging

1. **Environment Setup**: Ensure your `.env` file is properly configured with Azure Cosmos DB credentials:
   ```env
   AZURE_COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
   AZURE_COSMOS_KEY=your-azure-cosmos-key
   AZURE_COSMOS_DATABASE=your-database-name
   ```

2. **Emulator Running**: For migration and schema creation debugging, ensure the Cosmos DB emulator is running on `https://localhost:8081`

#### How to Debug

1. **Open VS Code** in the root project directory (`cloud-tools/`)
2. **Set Breakpoints** in the relevant files (`cli.js`, `migrator.js`, `config.js`, etc.)
3. **Open Debug Panel** (Ctrl+Shift+D / Cmd+Shift+D)
4. **Select Configuration** from the dropdown (e.g., "Debug: Cosmos Migration (Full)")
5. **Start Debugging** (F5 or click the play button)

#### Debugging Tips

- **Environment Variables**: All configurations automatically load environment variables from your `.env` file
- **Console Output**: Debug output appears in the VS Code integrated terminal
- **Breakpoints**: Set breakpoints in key locations:
  - `cli.js` - Command parsing and error handling
  - `migrator.js` - Core migration logic
  - `config.js` - Configuration validation
  - `schema-extractor.js` - Schema extraction logic
  - `schema-creator.js` - Schema creation logic
  - `data-migrator.js` - Data migration logic and error handling

- **Custom Arguments**: Use the "Debug: Cosmos Custom Arguments" configuration to test specific command combinations by modifying the `args` array in the root `.vscode/launch.json`

#### Common Debugging Scenarios

**Migration Issues:**
```javascript
// Set breakpoints in migrator.js at:
async migrate() {
    // Breakpoint here to debug migration start
}
```

**Configuration Problems:**
```javascript
// Set breakpoints in config.js at:
validate() {
    // Breakpoint here to debug config validation
}
```

**Schema Extraction Issues:**
```javascript
// Set breakpoints in schema-extractor.js at:
async extractSchema() {
    // Breakpoint here to debug extraction logic
}
```

**Data Migration Issues:**
```javascript
// Set breakpoints in data-migrator.js at:
async migrateDatabase() {
    // Breakpoint here to debug data migration start
}

async _migrateBatch() {
    // Breakpoint here to debug batch processing and error handling
}
```

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

## Data Migration Features

### Error Resilience
- **Continue on Errors**: Migration continues even if individual documents fail
- **Batch Processing**: Documents are processed in configurable batches for better performance
- **Retry Logic**: Automatic retries with exponential backoff for transient errors
- **Skip Existing**: Option to skip documents that already exist in the target database
- **Detailed Statistics**: Comprehensive reporting of migration success/failure rates

### Migration Statistics
After data migration, you'll see a detailed summary:
```
📊 Data Migration Summary:
Total Documents: 1500
✅ Migrated: 1485
⏭️  Skipped: 10
❌ Failed: 5
Success Rate: 99.0%
```

### Error Handling
- Rate limiting (429) and server errors (5xx) are automatically retried
- Document-level errors are logged but don't stop the migration
- Up to 10 specific error messages are displayed for troubleshooting
- System properties (_rid, _self, _etag, etc.) are automatically cleaned before migration

## Limitations

- Stored procedures, triggers, and UDFs are not migrated
- Some advanced indexing configurations may need manual adjustment
- Cross-region replication settings are not applicable to emulator
- Large documents (>2MB) may require special handling

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License
