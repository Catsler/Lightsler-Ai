#!/usr/bin/env bash
set -euo pipefail

REQUIRED_TOPICS=(
  "customers/data_request"
  "customers/redact"
  "shop/redact"
)

echo "🔍 Checking GDPR webhook subscriptions..."
WEBHOOKS_JSON=$(shopify app webhook list --json 2>/dev/null || true)

missing=()
for topic in "${REQUIRED_TOPICS[@]}"; do
  if echo "$WEBHOOKS_JSON" | grep -q "$topic"; then
    echo "✅ $topic registered"
  else
    echo "❌ $topic missing"
    missing+=("$topic")
  fi
done

if [ ${#missing[@]} -gt 0 ]; then
  echo "⚠️ Missing topics: ${missing[*]}"
  echo "💡 Run deployment to register webhooks: npm run deploy"
else
  echo "🎉 All required GDPR webhooks are registered."
fi

read -r -p "Trigger test webhooks now? (y/N) " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  for topic in "${REQUIRED_TOPICS[@]}"; do
    echo "📤 Triggering $topic ..."
    shopify app webhook trigger "$topic" || true
    sleep 2
  done
  echo "✅ Trigger commands sent. Check server logs for handling results."
fi
