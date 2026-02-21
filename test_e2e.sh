#!/bin/bash

# Configuration
URL="https://hkljqixkdkacbcudkoup.supabase.co/functions/v1/api-reply"
# Use a random session ID to ensure clean state
SESSION_ID="test_sess_$(date +%s)"

echo "--------------------------------------------------"
echo " TEST E2E: Booking Flow (Secure)"
echo " Session: $SESSION_ID"
echo " URL: $URL"
echo "--------------------------------------------------"

# 1. Availability Request
# Expect: "Disponibilità confermata! A che nome prenoto?" (or similar)
echo ""
echo "Step 1: Availability ('Vorrei un tavolo per 4 domani sera verso le 8')"
curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Vorrei un tavolo per 4 domani sera verso le 8", 
    "session_id": "'"$SESSION_ID"'",
    "source": "web"
  }'
echo ""

# 2. Provide Name
# Expect: "Grazie Mario Rossi, mi lasci un recapito telefonico?"
echo "Step 2: Name ('Mario Rossi')"
curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Mario Rossi", 
    "session_id": "'"$SESSION_ID"'",
    "source": "web"
  }'
echo ""

# 3. Provide Phone
# Expect: "Tutto pronto... Confermi?"
echo "Step 3: Phone ('3331234567')"
curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Il mio numero è 3331234567", 
    "session_id": "'"$SESSION_ID"'",
    "source": "web"
  }'
echo ""

# 4. Confirm
# Expect: "Prenotazione Confermata! Numero: ..."
echo "Step 4: Confirm ('Confermo')"
curl -s -X POST $URL \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Confermo tutto", 
    "session_id": "'"$SESSION_ID"'",
    "source": "web"
  }'
echo ""
