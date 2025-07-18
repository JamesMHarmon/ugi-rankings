#!/usr/bin/env node

// Test script to verify environment variables are passed to engines
const { spawn } = require('child_process');

async function testEngineWithEnvironmentVariables() {
    console.log('Testing engine with environment variables...');
    
    return new Promise((resolve, reject) => {
        // Test environment variables
        const testEnv = {
            ...process.env,
            TEST_MODE: 'true',
            ENGINE_LOG_LEVEL: 'debug',
            DEBUG_OUTPUT: '1'
        };

        const engineProcess = spawn('node', ['test-engines.js', 'TestEngineWithEnv'], {
            stdio: ['pipe', 'pipe', 'pipe'],
            env: testEnv
        });

        let output = '';
        
        const timeout = setTimeout(() => {
            engineProcess.kill();
            reject(new Error('Engine test timed out'));
        }, 5000);

        engineProcess.stdout.on('data', (data) => {
            output += data.toString();
            console.log('Engine output:', data.toString().trim());
            
            if (output.includes('ugiok')) {
                console.log('✅ Engine started successfully with environment variables');
                clearTimeout(timeout);
                engineProcess.stdin.write('quit\n');
                resolve();
            }
        });

        engineProcess.stderr.on('data', (data) => {
            console.error('Engine stderr:', data.toString());
        });

        engineProcess.on('error', (error) => {
            clearTimeout(timeout);
            reject(error);
        });

        engineProcess.on('exit', (code) => {
            clearTimeout(timeout);
            if (code === 0) {
                console.log('✅ Engine exited successfully');
                resolve();
            } else {
                reject(new Error(`Engine exited with code ${code}`));
            }
        });

        console.log('Starting engine with environment variables...');
        engineProcess.stdin.write('ugi\n');
    });
}

testEngineWithEnvironmentVariables().then(() => {
    console.log('✅ Environment variables test passed!');
}).catch((error) => {
    console.error('❌ Environment variables test failed:', error.message);
    process.exit(1);
});
