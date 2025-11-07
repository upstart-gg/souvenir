#!/usr/bin/env bash

# Database connection diagnostic script

echo "🔍 Souvenir Database Diagnostic"
echo "================================\n"

# Check Docker
echo "1️⃣  Checking Docker..."
if command -v docker &> /dev/null; then
    echo "✓ Docker is installed"
    if docker ps &> /dev/null; then
        echo "✓ Docker daemon is running"
    else
        echo "✗ Docker daemon is not running"
        echo "  Start Docker Desktop or run: sudo systemctl start docker"
        exit 1
    fi
else
    echo "✗ Docker not found. Install from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

# Check docker-compose
echo "\n2️⃣  Checking Docker Compose..."
if command -v docker-compose &> /dev/null; then
    VERSION=$(docker-compose --version)
    echo "✓ Docker Compose is installed: $VERSION"
else
    echo "✗ Docker Compose not found"
    echo "  Install with: brew install docker-compose"
    exit 1
fi

# Check dbmate
echo "\n3️⃣  Checking dbmate..."
if command -v dbmate &> /dev/null; then
    VERSION=$(dbmate --version)
    echo "✓ dbmate is installed: $VERSION"
else
    echo "✗ dbmate not found"
    echo "  Install with: brew install dbmate"
    exit 1
fi

# Check PostgreSQL container status
echo "\n4️⃣  Checking PostgreSQL container..."
if docker-compose ps postgres 2>/dev/null | grep -q "Up"; then
    echo "✓ PostgreSQL container is running"
    
    # Test connection
    echo "\n5️⃣  Testing database connection..."
    if PGPASSWORD=postgres psql -h localhost -U postgres -d souvenir_test -c "SELECT 1" 2>/dev/null; then
        echo "✓ Database connection successful"
        
        # Check migrations
        echo "\n6️⃣  Checking migrations..."
        if PGPASSWORD=postgres psql -h localhost -U postgres -d souvenir_test -c "\dt" 2>/dev/null | grep -q "public"; then
            echo "✓ Database tables exist (migrations applied)"
        else
            echo "⚠ Database appears empty. Run: bun run docker:up && dbmate up"
        fi
    else
        echo "✗ Database connection failed"
        echo "  Check PostgreSQL logs: bun run docker:logs"
    fi
else
    echo "✗ PostgreSQL container is not running"
    echo "  Start it with: bun run docker:up"
    exit 1
fi

echo "\n================================"
echo "✅ All checks passed! You can run:"
echo "   bun run test:local"
echo "   or"
echo "   bun run test:integration"
