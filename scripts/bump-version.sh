#!/bin/bash

# ===========================================
# 🏷️  QUAYER - VERSION BUMP SCRIPT
# ===========================================
# Incrementa versão seguindo Semantic Versioning
# Uso: ./scripts/bump-version.sh [major|minor|patch]

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

BUMP_TYPE=${1:-patch}

echo "=========================================="
echo "🏷️  QUAYER - VERSION BUMP"
echo "=========================================="
echo ""

# Validate bump type
if [ "$BUMP_TYPE" != "major" ] && [ "$BUMP_TYPE" != "minor" ] && [ "$BUMP_TYPE" != "patch" ]; then
    echo -e "${RED}❌ Bump type inválido: $BUMP_TYPE${NC}"
    echo "Use: major, minor, ou patch"
    exit 1
fi

# Check if VERSION file exists
if [ ! -f VERSION ]; then
    echo -e "${RED}❌ VERSION file not found!${NC}"
    echo "Creating VERSION file with 0.1.0"
    echo "0.1.0" > VERSION
fi

# Read current version
CURRENT_VERSION=$(cat VERSION)
echo "Current Version: v$CURRENT_VERSION"

# Parse version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

# Increment version
case $BUMP_TYPE in
    major)
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    minor)
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    patch)
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "New Version: v$NEW_VERSION"
echo ""

# Confirmation
read -p "Bump version from v$CURRENT_VERSION to v$NEW_VERSION? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Version bump cancelled."
    exit 0
fi

# Update VERSION file
echo "$NEW_VERSION" > VERSION
echo -e "${GREEN}✅ VERSION file updated${NC}"

# Update package.json
if [ -f package.json ]; then
    # Use jq if available, otherwise use sed
    if command -v jq &> /dev/null; then
        TMP_FILE=$(mktemp)
        jq ".version = \"$NEW_VERSION\"" package.json > "$TMP_FILE"
        mv "$TMP_FILE" package.json
        echo -e "${GREEN}✅ package.json updated${NC}"
    else
        echo -e "${YELLOW}⚠️  jq not found, skipping package.json update${NC}"
    fi
fi

# Git operations
echo ""
read -p "Commit and create tag? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Check git status
    if ! git diff-index --quiet HEAD --; then
        echo -e "${YELLOW}⚠️  There are uncommitted changes${NC}"
        git status --short
        echo ""
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo ""
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 0
        fi
    fi

    # Commit
    git add VERSION package.json 2>/dev/null || git add VERSION
    git commit -m "chore: bump version to v$NEW_VERSION"
    echo -e "${GREEN}✅ Changes committed${NC}"

    # Create tag
    git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
    echo -e "${GREEN}✅ Tag v$NEW_VERSION created${NC}"

    echo ""
    echo "📤 To push to remote:"
    echo "  git push origin $(git branch --show-current)"
    echo "  git push origin v$NEW_VERSION"
fi

# Update CHANGELOG.md
echo ""
read -p "Add entry to CHANGELOG.md? (y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f CHANGELOG.md ]; then
        DATE=$(date +%Y-%m-%d)
        TEMP_FILE=$(mktemp)

        # Create new entry
        echo "# Changelog" > "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        echo "## [Unreleased]" >> "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        echo "## [$NEW_VERSION] - $DATE" >> "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        echo "### 🚀 Features" >> "$TEMP_FILE"
        echo "- " >> "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        echo "### 🐛 Bug Fixes" >> "$TEMP_FILE"
        echo "- " >> "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"
        echo "### ⚡ Improvements" >> "$TEMP_FILE"
        echo "- " >> "$TEMP_FILE"
        echo "" >> "$TEMP_FILE"

        # Append existing changelog (skip first 3 lines)
        tail -n +4 CHANGELOG.md >> "$TEMP_FILE"

        mv "$TEMP_FILE" CHANGELOG.md
        echo -e "${GREEN}✅ CHANGELOG.md updated${NC}"
        echo -e "${YELLOW}⚠️  Edit CHANGELOG.md to add your changes${NC}"
    else
        echo -e "${YELLOW}⚠️  CHANGELOG.md not found${NC}"
    fi
fi

echo ""
echo "=========================================="
echo "📊 VERSION BUMP SUMMARY"
echo "=========================================="
echo ""
echo "Bump Type: $BUMP_TYPE"
echo "Old Version: v$CURRENT_VERSION"
echo "New Version: v$NEW_VERSION"
echo ""
echo -e "${GREEN}✅ Version bump completed!${NC}"
echo ""
echo "=========================================="
