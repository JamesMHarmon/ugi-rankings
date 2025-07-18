#!/usr/bin/env node

// Test script to verify that engine options are loaded correctly
const fs = require('fs');
const path = require('path');

// Simulate the getEngineWithConfig function
function getEngineWithConfig(engineDbRow) {
    try {
        const configFile = path.resolve('./engines.json');
        if (!fs.existsSync(configFile)) {
            throw new Error(`Configuration file not found: ${configFile}`);
        }

        const configData = fs.readFileSync(configFile, 'utf8');
        const config = JSON.parse(configData);

        const engineConfig = config.engines.find(e => e.name === engineDbRow.name);
        if (!engineConfig) {
            throw new Error(`Engine configuration not found for: ${engineDbRow.name}`);
        }

        // Merge database info with configuration
        return {
            ...engineDbRow,
            executable: engineConfig.executable,
            workingDirectory: engineConfig.workingDirectory,
            arguments: engineConfig.arguments,
            options: engineConfig.options || {},
            enabled: engineConfig.enabled,
            working_directory: engineConfig.workingDirectory // For backward compatibility
        };
    } catch (error) {
        console.error(`❌ Failed to load configuration for engine ${engineDbRow.name}:`, error);
        throw error;
    }
}

// Test with all engines
const sampleEngines = [
    { id: 1, name: 'Stockfish 16', rating: 2800, games_played: 0 },
    { id: 2, name: 'Komodo 14', rating: 2750, games_played: 0 },
    { id: 3, name: 'LC0 0.29', rating: 2700, games_played: 0 },
    { id: 4, name: 'Test Engine', rating: 1500, games_played: 0 }
];

console.log('Testing engine configuration loading...');

sampleEngines.forEach(engine => {
    console.log(`\n--- Testing ${engine.name} ---`);
    try {
        const engineWithConfig = getEngineWithConfig(engine);
        console.log('✅ Engine configuration loaded successfully:');
        console.log('Name:', engineWithConfig.name);
        console.log('Executable:', engineWithConfig.executable);
        console.log('Working Directory:', engineWithConfig.workingDirectory);
        console.log('Arguments:', engineWithConfig.arguments);
        console.log('Options:', engineWithConfig.options);
        console.log('Enabled:', engineWithConfig.enabled);
        
        // Test option formatting
        if (engineWithConfig.options && Object.keys(engineWithConfig.options).length > 0) {
            console.log('\nOptions would be sent as:');
            for (const [name, value] of Object.entries(engineWithConfig.options)) {
                console.log(`setoption name ${name} value ${value}`);
            }
        }
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
});
