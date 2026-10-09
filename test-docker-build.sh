#!/bin/bash

echo "Testing Docker build locally..."
echo ""

# Build the image
docker build -t nhit-backend-test:local .

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Docker build succeeded"
    echo ""
    echo "Testing if container starts..."
    
    # Try to run it with a timeout
    timeout 10s docker run --rm \
        -e MYSQL_HOST=test \
        -e MYSQL_USER=test \
        -e MYSQL_PASSWORD=test \
        -e MYSQL_DATABASE=test \
        -e JWT_SECRET=test-secret-at-least-16-chars \
        -e CORS_ORIGIN=http://localhost \
        -p 8080:8080 \
        nhit-backend-test:local
    
    EXIT_CODE=$?
    
    if [ $EXIT_CODE -eq 124 ]; then
        echo ""
        echo "✅ Container started successfully (timed out after 10s, which is expected)"
    else
        echo ""
        echo "❌ Container exited with code: $EXIT_CODE"
        echo "This means the application crashed on startup"
    fi
else
    echo ""
    echo "❌ Docker build failed"
fi
