#!/usr/bin/env bash
set -e

# Turn on swarm mode if it's not already on
docker swarm init 2> /dev/null || true

####################
# External Env Vars

# None used during dev-mode deployment

####################
# Internal Config

# meta config & hard-coded stuff you might want to change
number_of_services=4 # NOTE: Gotta update this manually when adding/removing services :(

# hard-coded config (you probably won't ever need to change these)
log_level="3" # set to 0 for no logs or to 5 for all the logs
project="indra_v2"

node_port=8080
nats_port=4222

eth_mnemonic="candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"
eth_network="ganache"
eth_network_id="4447"
eth_rpc_url="http://ethprovider:8545"

# database connection settings
postgres_db="$project"
postgres_password_file="/run/secrets/${project}_database_dev"
postgres_host="database"
postgres_port="5432"
postgres_user="$project"

# docker images
builder_image="${project}_builder"
database_image="postgres:9-alpine"
ethprovider_image="trufflesuite/ganache-cli:v6.4.3"
node_image="$builder_image"
nats_image="nats:2.0.0-linux"

####################
# Deploy according to above configuration

# Get images that we aren't building locally
function pull_if_unavailable {
  if [[ -z "`docker image ls | grep ${1%:*} | grep ${1#*:}`" ]]
  then docker pull $1
  fi
}
pull_if_unavailable $database_image
pull_if_unavailable $nats_image

# Initialize random new secrets
function new_secret {
  secret=$2
  if [[ -z "$secret" ]]
  then secret=`head -c 32 /dev/urandom | xxd -plain -c 32 | tr -d '\n\r'`
  fi
  if [[ -z "`docker secret ls -f name=$1 | grep -w $1`" ]]
  then
    id=`echo $secret | tr -d '\n\r' | docker secret create $1 -`
    echo "Created secret called $1 with id $id"
  fi
}
new_secret ${project}_database_dev $project

# Deploy with an attachable network so tests & the daicard can connect to individual components
if [[ -z "`docker network ls -f name=$project | grep -w $project`" ]]
then
  id="`docker network create --attachable --driver overlay $project`"
  echo "Created ATTACHABLE network with id $id"
fi

mkdir -p /tmp/$project
cat - > /tmp/$project/docker-compose.yml <<EOF
version: '3.4'

networks:
  $project:
    external: true

secrets:
  ${project}_database_dev:
    external: true

volumes:
  chain_dev:
  database_dev:
  certs:

services:
  node:
    image: $node_image
    entrypoint: bash modules/node/ops/entry.sh
    environment:
      INDRA_NATS_CLUSTER_ID:
      INDRA_NATS_SERVERS: nats://nats:$nats_port
      INDRA_NATS_TOKEN:
      INDRA_PG_DATABASE: $postgres_db
      INDRA_PG_HOST: $postgres_host
      INDRA_PG_PASSWORD_FILE: $postgres_password_file
      INDRA_PG_PORT: $postgres_port
      INDRA_PG_USERNAME: $postgres_user
      LOG_LEVEL: $log_level
      NODE_ENV: development
      ETH_MNEMONIC: $eth_mnemonic
      ETH_NETWORK: $eth_network
      ETH_RPC_URL: $eth_rpc_url
      PORT: $node_port
    networks:
      - $project
    ports:
      - "$node_port:$node_port"
    secrets:
      - ${project}_database_dev
    volumes:
      - `pwd`:/root

  ethprovider:
    image: $ethprovider_image
    command: ["--db=/data", "--mnemonic=$eth_mnemonic", "--networkId=$eth_network_id" ]
    networks:
      - $project
    ports:
      - "8545:8545"
    volumes:
      - chain_dev:/data

  database:
    image: $database_image
    deploy:
      mode: global
    environment:
      ETH_NETWORK: $eth_network
      MODE: dev
      POSTGRES_DB: $project
      POSTGRES_PASSWORD_FILE: $postgres_password_file
      POSTGRES_USER: $project
    networks:
      - $project
    ports:
      - "5432:5432"
    secrets:
      - ${project}_database_dev
    volumes:
      - database_dev:/var/lib/postgresql/data

  nats:
    image: $nats_image
    networks:
      - $project
    ports:
     - "$nats_port:$nats_port"
EOF

docker stack deploy -c /tmp/$project/docker-compose.yml $project
rm -rf /tmp/$project

echo -n "Waiting for the $project stack to wake up."
while [[ "`docker container ls | grep $project | wc -l | tr -d ' '`" != "$number_of_services" ]]
do echo -n "." && sleep 2
done
echo " Good Morning!"
