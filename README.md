# UGI Rankings

A UCI engine tournament system for abstract strategy board games with Elo rating.

## Features

- Load engine configurations from JSON files
- Elo rating system for engine tournaments
- PostgreSQL database for persistent storage
- TensorFlow.js integration for future ML features
- Docker support for easy deployment

## Quick Start

1. **Initialize the database:**
   ```bash
   npm run build
   node dist/index.js init-db
   ```

2. **Create your engines configuration:**
   - Copy `engines.example.json` to `engines.json`
   - Edit `engines.json` with your engine configurations
   - The system will automatically load engines from this file on startup

3. **Run a tournament:**
   ```bash
   node dist/index.js run-tournament --rounds 2 --pairs 2
   ```

4. **View current rankings:**
   ```bash
   node dist/index.js rankings
   ```

## Auto-Loading Engines

The system automatically loads engines from `engines.json` (or the file specified in the `ENGINES_CONFIG` environment variable) when the application starts. This ensures your engine configurations are always up-to-date without manual intervention.

If no config file is found, the system will continue to work but with no engines loaded. You can manually load engines using the `load-config` command.

## Tournament System

The system automatically runs games between engines and records results. Games are simulated for demonstration purposes, but the framework is designed to support real UCI engine execution.

### Tournament Features
- **Round-robin tournaments**: All engines play against each other
- **Configurable rounds**: Multiple rounds for statistical significance  
- **Concurrent games**: Run multiple games simultaneously
- **Time controls**: Configurable time limits per game
- **Automatic rating updates**: Elo ratings updated after each game
- **Game logging**: All results stored in PostgreSQL database

### Running Tournaments

```bash
# Run a quick tournament (2 rounds, 1 game per pair)
node dist/index.js run-tournament --rounds 2 --pairs 1

# Run longer tournament with more games per pairing
node dist/index.js run-tournament --rounds 5 --pairs 4 --concurrency 4

# Custom time control
node dist/index.js run-tournament --time-control "120+2"
```

## Configuration File Format

Create a JSON file with your engine configurations:

```json
{
  "tournament": {
    "name": "My Tournament",
    "description": "Description of the tournament",
    "timeControl": "60+1",
    "rounds": 2,
    "gamesPerPair": 2,
    "concurrency": 2
  },
  "engines": [
    {
      "name": "Engine Name",
      "executable": "./path/to/engine",
      "workingDirectory": "./engines",
      "arguments": ["--threads", "1"],
      "initialRating": 1500,
      "enabled": true,
      "description": "Optional description"
    }
  ]
}
```

## Commands

### Engine Management
- `load-config [-f <file>]` - Manually load engines from configuration file (optional, auto-loads on startup)
- `load-config -f <file> --replace` - Load engines and update existing ones
- `list-engines` - Show all engines with their configuration
- `list-engines --enabled-only` - Show only enabled engines

### Tournament & Games
- `run-tournament [-r <rounds>] [-p <pairs>] [-c <concurrency>] [--time-control <time>]` - Run automatic tournament
- `play-game -1 <engine1_id> -2 <engine2_id> [--time-control <time>]` - Play single game between engines
- `rankings [-l <limit>]` - Show current rankings
- `rankings --detailed` - Show detailed rankings with executable info

### System
- `init-db` - Initialize the database
- `test-db` - Test database connection
- `test-tf` - Test TensorFlow.js setup

## Testing

The project includes test engines for development and testing purposes:

```bash
# Use the test engines configuration
cp test-engines.json engines.json

# Run a test tournament with mock engines
node dist/index.js run-tournament

# Play a single test game
node dist/index.js play-game test1 test2
```

The test engines (`test-engines.js`) simulate UGI protocol communication and can be used to verify the tournament system works correctly before connecting real engines.

## Database Schema

The system uses PostgreSQL with the following tables:

- **engines**: Store engine information (name, executable, rating, stats)
- **games**: Store game results and rating changes

## Docker Usage

```bash
# Build the image
docker-compose build

# Run commands
docker-compose run app node dist/index.js init-db
docker-compose run app node dist/index.js load-config -f engines.json
docker-compose run app node dist/index.js rankings
```

## Development

```bash
npm install
npm run dev
```
