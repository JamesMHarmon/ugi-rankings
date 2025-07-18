# UGI Rankings

A UCI engine tournament system for abstract strategy board games with Elo rating.

## Features

- Load engine configurations from JSON files
- Elo rating system for engine tournaments  
- PostgreSQL database for persistent storage
- Continuous tournament system with intelligent pairing
- **Match Set System**: Play complete sets of games with multiple openings and color assignments
- **Aggregate Rating Updates**: Ratings updated based on entire match set results
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

## Match Set System

The tournament system now supports match sets, where each pairing plays a complete set of games across multiple starting positions with both color assignments. This provides more balanced and comprehensive results.

### Key Features:
- **Complete Color Balance**: Each engine plays both white and black for every starting position
- **Multiple Openings**: Games played from various starting positions (standard, tactical, endgame positions)
- **Aggregate Rating**: Ratings updated only after the complete match set is finished
- **Configurable Match Sets**: Define your own collections of starting positions

### Match Set Configuration

In your `engines.json` configuration file, you can define match sets:

```json
{
  "tournament": {
    "name": "My Tournament",
    "defaultMatchSet": "standard_openings",
    "matchSets": [
      {
        "name": "standard_openings",
        "description": "Common chess openings",
        "gamesPerPosition": 2,
        "startingPositions": [
          {
            "name": "Starting Position",
            "description": "Standard chess starting position",
            "moves": []
          },
          {
            "name": "King's Pawn Opening",
            "description": "1.e4",
            "moves": ["e2e4"]
          },
          {
            "name": "Queen's Pawn Opening",
            "description": "1.d4", 
            "moves": ["d2d4"]
          }
        ]
      }
    ]
  }
}
```

### How Match Sets Work

1. **Pairing Selection**: The system selects optimal engine pairings based on uncertainty, rating proximity, and game frequency
2. **Complete Match Set**: For each pairing, all starting positions are played with both color assignments
3. **Game Execution**: Each starting position results in 2 games (engine1 as white, engine1 as black)
4. **Score Calculation**: Match set score is calculated (wins=1, draws=0.5, losses=0)
5. **Rating Update**: Elo ratings are updated based on the aggregate match set score

## Auto-Loading Engines

The system automatically loads engines from `engines.json` (or the file specified in the `ENGINES_CONFIG` environment variable) when the application starts. This ensures your engine configurations are always up-to-date without manual intervention.

If no config file is found, the system will continue to work but with no engines loaded. You can manually load engines using the `load-config` command.

## Tournament System

The system automatically runs games between engines and records results. Games are simulated for demonstration purposes, but the framework is designed to support real UCI engine execution.

### Tournament Features
- **Match Set Tournaments**: Complete sets of games with multiple openings and balanced colors
- **Configurable rounds**: Multiple rounds for statistical significance  
- **Concurrent match sets**: Run multiple match sets simultaneously
- **Time controls**: Configurable time limits per game
- **Aggregate rating updates**: Elo ratings updated after complete match sets
- **Comprehensive game logging**: All results stored in PostgreSQL database with position and color tracking

### Running Tournaments

```bash
# Run a quick tournament (2 rounds, 1 match set per pair)
node dist/index.js run-tournament --rounds 2 --pairs 1

# Run longer tournament with more match sets per pairing
node dist/index.js run-tournament --rounds 5 --pairs 4 --concurrency 2

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
    "concurrency": 2,
    "defaultMatchSet": "standard_openings",
    "matchSets": [
      {
        "name": "standard_openings",
        "description": "Common chess openings",
        "gamesPerPosition": 2,
        "startingPositions": [
          {
            "name": "Starting Position",
            "description": "Standard starting position",
            "moves": []
          },
          {
            "name": "King's Pawn Opening",
            "description": "1.e4",
            "moves": ["e2e4"]
          }
        ]
      }
    ]
  },
  "engines": [
    {
      "name": "Engine Name",
      "executable": "./path/to/engine",
      "workingDirectory": "./engines",
      "arguments": ["--threads", "1"],
      "initialRating": 1500,
      "enabled": true,
      "description": "Optional description",
      "options": {
        "Hash": 128,
        "Threads": 1
      },
      "env": {
        "ENGINE_LOG_LEVEL": "info",
        "CUSTOM_VAR": "value"
      }
    }
  ]
}
```

### Engine Configuration Options

- **options**: Engine-specific options sent via `setoption name <name> value <value>` commands
- **env**: Environment variables set when starting the engine process

Common environment variables:
- `ENGINE_LOG_LEVEL`: Controls engine logging verbosity
- `CUDA_VISIBLE_DEVICES`: GPU selection for CUDA-enabled engines
- `LC0_BACKEND`: Backend selection for Leela Chess Zero
- `TEST_MODE`: Enable test mode for development engines

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

- **engines**: Store engine information (name, description, rating, game statistics)
  - Engine executable information is only stored in the configuration file
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
