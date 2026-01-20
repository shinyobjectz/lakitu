#!/bin/bash
# Start convex-backend and deploy functions if needed

STORAGE_DIR=/home/user/.convex/convex-backend-state/lakitu
SQLITE_DB=$STORAGE_DIR/convex_local_backend.sqlite3
MODULES_DIR=$STORAGE_DIR/modules

# Start convex-backend in background
convex-backend \
  "$SQLITE_DB" \
  --port 3210 \
  --site-proxy-port 3211 \
  --local-storage "$STORAGE_DIR" \
  --disable-beacon &

BACKEND_PID=$!

# Wait for backend to be ready
for i in {1..30}; do
  if curl -s http://127.0.0.1:3210/version > /dev/null 2>&1; then
    echo "Backend ready"
    break
  fi
  sleep 1
done

# Deploy functions if not already deployed
if [ ! -d "$MODULES_DIR" ] || [ -z "$(ls -A $MODULES_DIR 2>/dev/null)" ]; then
  echo "Deploying Convex functions..."
  cd /home/user/lakitu
  export CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
  export CONVEX_SELF_HOSTED_ADMIN_KEY=0135d8598650f8f5cb0f30c34ec2e2bb62793bc28717c8eb6fb577996d50be5f4281b59181095065c5d0f86a2c31ddbe9b597ec62b47ded69782cd
  
  # Run deployment and wait for completion
  if npx convex dev --once --typecheck disable > /tmp/convex-deploy.log 2>&1; then
    echo "Functions deployed successfully"
  else
    echo "Function deployment failed, check /tmp/convex-deploy.log"
    cat /tmp/convex-deploy.log
  fi
  
  # Wait for modules to be ready (up to 30 seconds)
  echo "Waiting for modules..."
  for i in {1..30}; do
    if [ -d "$MODULES_DIR" ] && [ -n "$(ls -A $MODULES_DIR 2>/dev/null)" ]; then
      MODULE_COUNT=$(ls -1 $MODULES_DIR | wc -l)
      echo "Modules ready: $MODULE_COUNT files"
      break
    fi
    sleep 1
  done
fi

# Wait for backend process
wait $BACKEND_PID
