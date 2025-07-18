#!/bin/bash

# Test runner script for UGI Rankings System

echo "🧪 UGI Rankings Test Suite"
echo "========================="

# Function to run specific test suite
run_test_suite() {
    local suite_name=$1
    local test_file=$2
    
    echo ""
    echo "📋 Running $suite_name tests..."
    echo "File: $test_file"
    echo "---"
    
    npx jest "$test_file" --verbose
    
    if [ $? -eq 0 ]; then
        echo "✅ $suite_name tests passed!"
    else
        echo "❌ $suite_name tests failed!"
        return 1
    fi
}

# Check if specific test is requested
if [ "$1" != "" ]; then
    case $1 in
        "database"|"db")
            run_test_suite "Database" "tests/database.test.ts"
            ;;
        "ugi"|"engine")
            run_test_suite "UGI Engine" "tests/ugi-engine.test.ts"
            ;;
        "tournament"|"tourney")
            run_test_suite "Tournament" "tests/tournament.test.ts"
            ;;
        "config"|"configuration")
            run_test_suite "Configuration" "tests/configuration.test.ts"
            ;;
        "elo"|"rating")
            run_test_suite "ELO Rating" "tests/elo-rating.test.ts"
            ;;
        "integration"|"int")
            run_test_suite "Integration" "tests/integration.test.ts"
            ;;
        "all")
            echo "🔄 Running all test suites..."
            ;;
        *)
            echo "❓ Unknown test suite: $1"
            echo ""
            echo "Available test suites:"
            echo "  database, db       - Database functionality tests"
            echo "  ugi, engine        - UGI engine communication tests"
            echo "  tournament, tourney- Tournament system tests"
            echo "  config             - Configuration management tests"
            echo "  elo, rating        - ELO rating calculation tests"
            echo "  integration, int   - Integration tests"
            echo "  all                - Run all tests"
            exit 1
            ;;
    esac
else
    # Run all tests if no specific suite requested
    echo "🔄 Running all test suites..."
fi

# If running all tests or specific test passed, run the full suite
if [ "$1" = "all" ] || [ "$1" = "" ]; then
    echo ""
    echo "🎯 Running complete test suite..."
    
    run_test_suite "Database" "tests/database.test.ts"
    run_test_suite "UGI Engine" "tests/ugi-engine.test.ts" 
    run_test_suite "Tournament" "tests/tournament.test.ts"
    run_test_suite "Configuration" "tests/configuration.test.ts"
    run_test_suite "ELO Rating" "tests/elo-rating.test.ts"
    run_test_suite "Integration" "tests/integration.test.ts"
    
    echo ""
    echo "📊 Generating coverage report..."
    npx jest --coverage
    
    echo ""
    echo "🎉 All tests completed!"
    echo ""
    echo "📈 Coverage report available in: coverage/lcov-report/index.html"
fi
