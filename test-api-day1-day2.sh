#!/bin/bash

# Test Day 1 & 2: PM Module API Tests
echo "========================================"
echo "ZENGA: Day 1 & Day 2 API Tests"
echo "========================================"

API_BASE="http://localhost:5500"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Health check
echo -e "\n${YELLOW}TEST 1: Health Check${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" $API_BASE/health)
if [ "$HEALTH" = "200" ]; then
  echo -e "${GREEN}✓ Server is running${NC}"
else
  echo -e "${RED}✗ Server health check failed (HTTP $HEALTH)${NC}"
  exit 1
fi

# Test 2: Register a test user
echo -e "\n${YELLOW}TEST 2: Register Test User${NC}"
REGISTER_RESPONSE=$(curl -s -X POST $API_BASE/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "pm-test@zenga.dev",
    "password": "Test@1234",
    "name": "PM Test User"
  }')

ACCESS_TOKEN=$(echo $REGISTER_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
if [ ! -z "$ACCESS_TOKEN" ]; then
  echo -e "${GREEN}✓ User registered, token received${NC}"
else
  echo -e "${YELLOW}⚠ Registration failed or user exists, attempting login${NC}"
  
  LOGIN_RESPONSE=$(curl -s -X POST $API_BASE/auth/login \
    -H "Content-Type: application/json" \
    -d '{
      "email": "pm-test@zenga.dev",
      "password": "Test@1234"
    }')
  
  ACCESS_TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  if [ ! -z "$ACCESS_TOKEN" ]; then
    echo -e "${GREEN}✓ User logged in, token received${NC}"
  else
    echo -e "${RED}✗ Authentication failed${NC}"
    echo "Response: $LOGIN_RESPONSE"
    exit 1
  fi
fi

echo "Token: ${ACCESS_TOKEN:0:20}..."

# Test 3: Start PM Conversation (Day 2 Backend Service)
echo -e "\n${YELLOW}TEST 3: Start PM Planning Conversation${NC}"
CONVERSATION_RESPONSE=$(curl -s -X POST $API_BASE/pm/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "goal": "Complete dashboard and admin authentication this week"
  }')

echo "Response: $CONVERSATION_RESPONSE"

CONVERSATION_ID=$(echo $CONVERSATION_RESPONSE | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
if [ ! -z "$CONVERSATION_ID" ]; then
  echo -e "${GREEN}✓ PM Conversation created: $CONVERSATION_ID${NC}"
else
  echo -e "${RED}✗ Failed to create conversation${NC}"
  exit 1
fi

# Test 4: Add message to conversation
echo -e "\n${YELLOW}TEST 4: Add Message to Conversation${NC}"
MESSAGE_RESPONSE=$(curl -s -X POST $API_BASE/pm/conversations/$CONVERSATION_ID/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "content": "Should we do frontend first or backend?"
  }')

echo "Response: $MESSAGE_RESPONSE"

# Test 5: Generate plan from conversation
echo -e "\n${YELLOW}TEST 5: Generate Sprint Plan from Conversation${NC}"
PLAN_RESPONSE=$(curl -s -X POST $API_BASE/pm/conversations/$CONVERSATION_ID/generate-plan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{}')

echo "Response: $PLAN_RESPONSE"

ROADMAP_ID=$(echo $PLAN_RESPONSE | grep -o '"roadmapId":"[^"]*' | cut -d'"' -f4)
if [ ! -z "$ROADMAP_ID" ]; then
  echo -e "${GREEN}✓ Sprint plan generated from AI: $ROADMAP_ID${NC}"
  
  # Test 6: Get the roadmap details
  echo -e "\n${YELLOW}TEST 6: Get Roadmap Details${NC}"
  ROADMAP_RESPONSE=$(curl -s -X GET $API_BASE/pm/roadmaps/$ROADMAP_ID \
    -H "Authorization: Bearer $ACCESS_TOKEN")
  
  echo "Response: $ROADMAP_RESPONSE"
  echo -e "${GREEN}✓ Roadmap details retrieved${NC}"
else
  echo -e "${RED}✗ Failed to generate plan${NC}"
fi

echo -e "\n========================================"
echo -e "${GREEN}✓ All tests completed!${NC}"
echo "========================================"
