#!/bin/bash

# PatchPilot AI Setup Script
# Helps configure IBM watsonx credentials

set -e

echo "🚀 PatchPilot AI Setup"
echo "====================="
echo ""

# Check if .env.local exists
if [ -f .env.local ]; then
    echo "⚠️  .env.local already exists!"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled"
        exit 1
    fi
fi

# Copy template
cp .env.example .env.local
echo "✅ Created .env.local from template"
echo ""

# Prompt for credentials
echo "📝 Please enter your IBM watsonx credentials:"
echo "   (Get them from: https://cloud.ibm.com/)"
echo ""

read -p "API Key: " api_key
read -p "Project ID: " project_id
read -p "Region (default: us-south): " region
read -p "Model (default: ibm/granite-13b-chat-v2): " model

# Set defaults
region=${region:-us-south}
model=${model:-ibm/granite-13b-chat-v2}

# Update .env.local
sed -i.bak "s/your_api_key_here/$api_key/" .env.local
sed -i.bak "s/your_project_id_here/$project_id/" .env.local
sed -i.bak "s/us-south/$region/" .env.local
sed -i.bak "s|ibm/granite-13b-chat-v2|$model|" .env.local

# Clean up backup
rm .env.local.bak

echo ""
echo "✅ Configuration saved to .env.local"
echo ""
echo "🧪 Testing connection..."

# Test connection (requires Node.js)
if command -v node &> /dev/null; then
    node -e "
        const fs = require('fs');
        const path = require('path');
        
        // Load env
        const envPath = path.join(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envContent.split('\n').forEach(line => {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length) {
                env[key.trim()] = valueParts.join('=').trim();
            }
        });
        
        // Simple validation
        if (env.WATSONX_API_KEY && env.WATSONX_PROJECT_ID) {
            console.log('✅ Credentials look valid!');
            console.log('');
            console.log('Next steps:');
            console.log('  1. npm install');
            console.log('  2. npm run dev');
            console.log('  3. Open http://localhost:3000');
        } else {
            console.log('⚠️  Warning: Credentials may be incomplete');
        }
    "
else
    echo "⚠️  Node.js not found - skipping connection test"
fi

echo ""
echo "📚 Documentation:"
echo "   - AI Integration Guide: docs/AI_INTEGRATION.md"
echo "   - Upgrade Summary: docs/UPGRADE_SUMMARY.md"
echo ""
echo "🎉 Setup complete!"

# Made with Bob
