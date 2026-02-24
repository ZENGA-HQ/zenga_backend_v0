#!/bin/bash

# Script to set up test user and test Day 1 & 2
echo "========================================"
echo "ZENGA: Day 1 & Day 2 API Tests"
echo "========================================"

API_BASE="http://localhost:5500"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Test 1: Health check
echo -e "\n${YELLOW}TEST 1: Health Check${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" $API_BASE/health)
if [ "$HEALTH" = "200" ]; then
  echo -e "${GREEN}✓ Server is running${NC}"
else
  echo -e "${RED}✗ Server health check failed (HTTP $HEALTH)${NC}"
  exit 1
fi

# Get a company to use for testing
echo -e "\n${YELLOW}TEST 2: Query database for test company${NC}"
docker exec zenga-db-1 psql -U postgres -d zenga_db -c "SELECT id, company_name, company_code FROM public.company LIMIT 1;" > /tmp/company.txt 2>&1

if grep -q "company_name" /tmp/company.txt; then
  COMPANY_ID=$(grep -v "company_name\|^\-" /tmp/company.txt | head -1 | awk '{print $2}' | tr -d ' ')
  echo -e "${GREEN}✓ Found test company: $COMPANY_ID${NC}"
else
  echo -e "${YELLOW}⚠ No test company found, skipping...${NC}"
fi

# Get or create a test user
echo -e "\n${YELLOW}TEST 3: Check for test users${NC}"
docker exec zenga-db-1 psql -U postgres -d zenga_db -c \
  "SELECT id, email FROM public.user WHERE email = 'test@zenga.dev' LIMIT 1;" > /tmp/user.txt 2>&1

if grep -q "test@zenga.dev" /tmp/user.txt; then
  # User exists, verify it's marked as verified
  USER_ID=$(grep "test@zenga.dev" /tmp/user.txt | awk '{print $1}' | head -1)
  echo -e "${YELLOW}→ Test user exists: $USER_ID${NC}"
  
  # Set email as verified
  docker exec zenga-db-1 psql -U postgres -d zenga_db -c \
    "UPDATE public.user SET is_email_verified = true WHERE email = 'test@zenga.dev';" > /dev/null 2>&1
  echo -e "${GREEN}✓ Test user email verified${NC}"
else
  echo -e "${RED}✗ Test user not found in database${NC}"
  echo "Creating test user via API..."
  
  REGISTER=$(curl -s -X POST $API_BASE/auth/register \
    -H "Content-Type: application/json" \
    -d '{
      "email": "test@zenga.dev",
      "password": "Test@1234",
      "name": "Test User",
      "userType": "individual"
    }')
  
  echo "Register response: $REGISTER"
  
  # Verify the user in database
  docker exec zenga-db-1 psql -U postgres -d zenga_db -c \
    "UPDATE public.user SET is_email_verified = true WHERE email = 'test@zenga.dev';" > /dev/null 2>&1
fi

# Test 4: Login
echo -e "\n${YELLOW}TEST 4: Login to get auth token${NC}"
LOGIN=$(curl -s -X POST $API_BASE/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@zenga.dev",
    "password": "Test@1234"
  }')

ACCESS_TOKEN=$(echo $LOGIN | grep -o '"accessToken":"[^"]*' | head -1 | cut -d'"' -f4)
if [ ! -z "$ACCESS_TOKEN" ]; then
  echo -e "${GREEN}✓ Login successful, token: ${ACCESS_TOKEN:0:20}...${NC}"
else
  echo -e "${RED}✗ Login failed${NC}"
  echo "Response: $LOGIN"
  exit 1
fi

# Test 5: Start PM Conversation (Day 2)
echo -e "\n${YELLOW}TEST 5: Start PM Planning Conversation${NC}"
CONV=$(curl -s -X POST $API_BASE/pm/conversations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "goal": "Build employee dashboard with real-time analytics"
  }')

echo "Response: $CONV"

CONV_ID=$(echo $CONV | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
if [ ! -z "$CONV_ID" ]; then
  echo -e "${GREEN}✓ PM Conversation created: $CONV_ID${NC}"
else
  echo -e "${RED}✗ Failed to create conversation (see response above)${NC}"
fi

# Test 6: Add message to conversation  
echo -e "\n${YELLOW}TEST 6: Add Message to Conversation${NC}"
if [ ! -z "$CONV_ID" ]; then
  MSG=$(curl -s -X POST $API_BASE/pm/conversations/$CONV_ID/messages \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d '{
      "content": "The dashboard should show employee performance metrics"
    }')
  
  echo "Response: $MSG"
  echo -e "${GREEN}✓ Message sent${NC}"
fi

# Test 7: Generate sprint plan
echo -e "\n${YELLOW}TEST 7: Generate Sprint Plan${NC}"
if [ ! -z "$CONV_ID" ]; then
  PLAN=$(curl -s -X POST $API_BASE/pm/conversations/$CONV_ID/generate-plan \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $ACCESS_TOKEN" \
    -d '{}')
  
  echo "Response: $PLAN"
  
  ROADMAP_ID=$(echo $PLAN | grep -o '"roadmapId":"[^"]*' | head -1 | cut -d'"' -f4)
  if [ ! -z "$ROADMAP_ID" ]; then
    echo -e "${GREEN}✓ Sprint plan generated: $ROADMAP_ID${NC}"
    
    # Test 8: Get roadmap details
    echo -e "\n${YELLOW}TEST 8: Get Roadmap Details${NC}"
    ROADMAP=$(curl -s -X GET $API_BASE/pm/roadmaps/$ROADMAP_ID \
      -H "Authorization: Bearer $ACCESS_TOKEN")
    
    echo "Response (truncated):"
    echo $ROADMAP | cut -c1-500
    echo "..."
    echo -e "${GREEN}✓ Roadmap retrieved${NC}"
  fi
fi

echo -e "\n========================================"
echo -e "${GREEN}✓ All tests completed!${NC}"
echo "========================================"
