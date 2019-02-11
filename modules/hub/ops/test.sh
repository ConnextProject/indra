#!/bin/bash
set -e

echo "Activating tester.."
date "+%s" > /tmp/timestamp

project=connext
dir=`pwd | sed 's/indra.*/indra/'`/modules/client

POSTGRES_DB="test_$project"
POSTGRES_USER="$project"
POSTGRES_PASSWORD="$project"
POSTGRES_HOST="${project}_test_database"
REDIS_HOST="${project}_test_redis"
ETHPROVIDER_HOST="${project}_test_ethprovider"

DATABASE="$POSTGRES_HOST:5432"
DATABASE_URL="postgresql://$POSTGRES_USER:$POSTGRES_PASSWORD@$DATABASE/$POSTGRES_DB"
REDIS="$REDIS_HOST:6379"
REDIS_URL="redis://$REDIS"
ETH_RPC_URL="$ETHPROVIDER_HOST:8545"

# Kill the test database when this script exits
function cleanup {
  echo "Tests finished, stopping test containers.."
  docker container stop $REDIS_HOST 2> /dev/null || true
  docker container stop $ETHPROVIDER_HOST 2> /dev/null || true
  docker container stop $POSTGRES_HOST 2> /dev/null || true
  docker container stop ${project}_tester 2> /dev/null || true
  echo "Testing complete in $((`date "+%s"` - `cat /tmp/timestamp`)) seconds!"
}
trap cleanup EXIT

# Start test redis
docker run --rm --detach --name=$REDIS_HOST --network=$project redis:5-alpine

# Start test ethprovider
docker run --rm --detach --name=$ETHPROVIDER_HOST --network=$project \
  --env ETH_NETWORK_ID=4447 \
  --env ETH_MNEMONIC="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat" \
  ${project}_ethprovider:dev

# Start test database
docker run --rm --detach --name=$POSTGRES_HOST --network=$project \
  --env POSTGRES_DB=$POSTGRES_DB \
  --env POSTGRES_USER=$POSTGRES_USER \
  --env POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  --tmpfs /var/lib/postgresql/data \
  ${project}_database:dev

# Run tests
docker run --rm --tty --name ${project}_tester --network=$project \
  --env ETHPROVIDER_HOST=$ETHPROVIDER_HOST \
  --env REDIS_HOST=$REDIS_HOST \
  --env POSTGRES_HOST=$POSTGRES_HOST \
  --env POSTGRES_DB=$POSTGRES_DB \
  --env POSTGRES_USER=$POSTGRES_USER \
  --env POSTGRES_PASSWORD=$POSTGRES_PASSWORD \
  --env POSTGRES_URL=$POSTGRES_URL \
  --env DATABASE=$DATABASE \
  --env REDIS=$REDIS \
  --env ETH_RPC_URL=$ETH_RPC_URL \
  --entrypoint=bash ${project}_hub:dev -c '
    ops/wait-for-it.sh -t 60 $POSTGRES_HOST:5433
    ops/wait-for-it.sh -t 60 $DATABASE
    ops/wait-for-it.sh -t 60 $REDIS
    ops/wait-for-it.sh -t 60 $ETH_RPC_URL
    ./node_modules/.bin/mocha \
      -r ./dist/register/common.js \
      -r ./dist/register/testing.js \
      "dist/**/*.test.js" --exit
  '
