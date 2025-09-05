# Azure Storage Migrator

A powerful command-line tool for migrating data between Azure Storage Accounts. This tool supports migrating blob containers, file shares, queues, and tables from one Azure Storage Account to another.

## Features

- **Blob Storage Migration**: Complete migration of containers and blobs with metadata preservation
- **Flexible Authentication**: Support for connection strings, account keys, and SAS tokens
- **Parallel Processing**: Configurable batch sizes and concurrency for optimal performance
- **Error Handling**: Robust retry mechanisms and continue-on-error options
- **Filtering**: Container filters, blob prefixes, and exclude patterns
- **Progress Tracking**: Real-time progress bars and detailed migration summaries
- **Validation**: Pre-migration connectivity and credential validation

## Installation

1. Navigate to the storage-migrator directory:
```bash
cd azure/storage/storage-migrator
```

2. Install dependencies:
```bash
npm install
```

## Configuration

### Environment Variables

Copy the `.env.example` file to `.env` and configure your storage account credentials:

```bash
cp .env.example .env
```

Edit the `.env` file with your storage account details:

```env
# Source Storage Account
SOURCE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=source;AccountKey=key;EndpointSuffix=core.windows.net

# Destination Storage Account  
DESTINATION_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=destination;AccountKey=key;EndpointSuffix=core.windows.net
```

### Authentication Options

You can authenticate using any of these methods:

1. **Connection String** (Recommended):
   ```env
   SOURCE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...
   ```

2. **Account Name + Key**:
   ```env
   SOURCE_STORAGE_ACCOUNT_NAME=mystorageaccount
   SOURCE_STORAGE_ACCOUNT_KEY=myaccountkey
   ```

3. **Account Name + SAS Token**:
   ```env
   SOURCE_STORAGE_ACCOUNT_NAME=mystorageaccount
   SOURCE_STORAGE_SAS_TOKEN=sv=2021-06-08&ss=b&srt=sco&sp=rwdlacupx&se=...
   ```

## Usage

### Complete Migration

Migrate all supported services from source to destination:

```bash
node cli.js migrate
```

With custom options:
```bash
node cli.js migrate \
  --source-connection-string "DefaultEndpointsProtocol=https;AccountName=source;AccountKey=key;EndpointSuffix=core.windows.net" \
  --destination-connection-string "DefaultEndpointsProtocol=https;AccountName=dest;AccountKey=key;EndpointSuffix=core.windows.net" \
  --include-files \
  --container-filter "^prod.*" \
  --skip-existing \
  --batch-size 20
```

### List Storage Services

List all containers and services in the source storage account:

```bash
node cli.js list --source-connection-string "your-connection-string"
```

### Copy Specific Containers

Copy only specific containers:

```bash
node cli.js copy container1 container2 container3 \
  --source-connection-string "source-connection-string" \
  --destination-connection-string "destination-connection-string"
```

### Validate Credentials

Test connectivity to both storage accounts:

```bash
node cli.js validate \
  --source-connection-string "source-connection-string" \
  --destination-connection-string "destination-connection-string"
```

## Command Options

### Global Options

| Option | Description | Default |
|--------|-------------|---------|
| `--batch-size <size>` | Batch size for parallel operations | 10 |
| `--max-concurrency <count>` | Maximum concurrent operations | 5 |
| `--max-retries <retries>` | Maximum retry attempts | 3 |
| `--overwrite` | Overwrite existing items | false |
| `--skip-existing` | Skip existing items | false |
| `--continue-on-error` | Continue on errors | true |

### Service Options

| Option | Description | Default |
|--------|-------------|---------|
| `--include-blobs` | Include blob storage | true |
| `--include-files` | Include file shares | false |
| `--include-queues` | Include queues | false |
| `--include-tables` | Include tables | false |

### Filtering Options

| Option | Description |
|--------|-------------|
| `--container-filter <pattern>` | Filter containers by regex pattern |
| `--blob-prefix <prefix>` | Only migrate blobs with this prefix |
| `--exclude-patterns <patterns>` | Comma-separated exclude patterns |

### Preservation Options

| Option | Description | Default |
|--------|-------------|---------|
| `--preserve-metadata` | Preserve item metadata | true |
| `--preserve-access-tier` | Preserve blob access tiers | true |

## Examples

### Basic Migration
```bash
# Migrate all blob containers
node cli.js migrate
```

### Production Migration with Filters
```bash
# Migrate only production containers, skip existing files
node cli.js migrate \
  --container-filter "^prod" \
  --skip-existing \
  --batch-size 20 \
  --max-concurrency 10
```

### Backup Specific Containers
```bash
# Copy specific containers for backup
node cli.js copy backup-container logs-container \
  --preserve-metadata \
  --preserve-access-tier
```

### Development Environment Setup
```bash
# Copy development data with overwrite
node cli.js copy dev-data test-data \
  --overwrite \
  --blob-prefix "samples/"
```

## Performance Tuning

### Batch Size
- **Small files**: Use larger batch sizes (20-50)
- **Large files**: Use smaller batch sizes (5-10)
- **Mixed workload**: Start with default (10)

### Concurrency
- **High bandwidth**: Increase max-concurrency (10-20)
- **Rate limiting**: Decrease max-concurrency (2-5)
- **Balanced**: Use default (5)

### Network Considerations
- Use Azure VMs in the same region for faster transfers
- Consider Azure Data Box for very large migrations (>10TB)
- Monitor network costs for cross-region transfers

## Error Handling

The tool includes comprehensive error handling:

- **Automatic Retries**: Failed operations are retried up to `max-retries` times
- **Continue on Error**: Migration continues even if individual items fail
- **Detailed Logging**: All errors are logged with specific item details
- **Progress Preservation**: Completed items are not re-processed on restart

## Limitations

### Current Version
- **File Shares**: Not yet implemented (planned for v1.1)
- **Queues**: Not yet implemented (planned for v1.1)
- **Tables**: Not yet implemented (planned for v1.2)
- **Incremental Sync**: Not supported (full migration only)

### Azure Storage Limits
- Maximum blob size: 5TB per blob
- Maximum containers per account: 500,000
- Rate limits apply based on storage account type

## Troubleshooting

### Common Issues

**Authentication Errors**:
```bash
# Validate credentials first
node cli.js validate --source-connection-string "..." --destination-connection-string "..."
```

**Network Timeouts**:
```bash
# Reduce concurrency and batch size
node cli.js migrate --max-concurrency 2 --batch-size 5
```

**Rate Limiting**:
```bash
# Add delays and reduce concurrency
node cli.js migrate --max-concurrency 1 --max-retries 5
```

### Debug Mode

Set environment variable for detailed logging:
```bash
export DEBUG=azure-storage-migrator:*
node cli.js migrate
```

## Security Best Practices

1. **Use SAS Tokens**: Prefer SAS tokens with minimal required permissions
2. **Environment Variables**: Store credentials in environment variables, not code
3. **Network Security**: Use private endpoints when possible
4. **Access Logging**: Enable storage account logging for audit trails
5. **Temporary Access**: Use time-limited SAS tokens for migration operations

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review Azure Storage documentation
3. Create an issue in the repository
