#!/usr/bin/env node

// Simple test to verify engine options are being sent
const { spawn } = require('child_process');

async function testEngineOptions() {
    console.log('Testing engine options functionality...');
    
    return new Promise((resolve, reject) => {
        const engineProcess = spawn('node', ['test-engines.js', 'TestEngine'], {
            stdio: ['pipe', 'pipe', 'pipe']
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
                console.log('Sending test options...');
                engineProcess.stdin.write('setoption name Hash value 128\n');
                engineProcess.stdin.write('setoption name Threads value 1\n');
                engineProcess.stdin.write('setoption name TestOption value testvalue\n');
                engineProcess.stdin.write('isready\n');
            }
            
            if (output.includes('readyok')) {
                console.log('✅ Engine ready! Options were sent successfully.');
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

        console.log('Starting engine communication...');
        engineProcess.stdin.write('ugi\n');
    });
}

testEngineOptions().then(() => {
    console.log('✅ All tests passed!');
}).catch((error) => {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
});
