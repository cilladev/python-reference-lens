#!/bin/bash

# Python Reference Lens - Installation Script

echo "🔧 Installing Python Reference Lens..."

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js first."
    exit 1
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Compile TypeScript
echo "🔨 Compiling TypeScript..."
npm run compile

# Check if vsce is installed
if ! command -v vsce &> /dev/null; then
    echo "📦 Installing vsce..."
    npm install -g @vscode/vsce
fi

# Package extension
echo "📦 Packaging extension..."
vsce package

# Find the generated vsix file
VSIX_FILE=$(ls -t *.vsix 2>/dev/null | head -1)

if [ -z "$VSIX_FILE" ]; then
    echo "❌ Failed to create VSIX package"
    exit 1
fi

# Install extension
echo "🚀 Installing extension..."
code --install-extension "$VSIX_FILE"

echo "✅ Python Reference Lens installed successfully!"
echo "🔄 Please restart VS Code to activate the extension."
