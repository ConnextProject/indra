#!/usr/bin/env bash
set -e

## This script will start a testnet chain & store that chain's data in indra/.chaindata/${chain_id}

root="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." >/dev/null 2>&1 && pwd )"
project="`cat $root/package.json | grep '"name":' | head -n 1 | cut -d '"' -f 4`"
registry="`cat $root/package.json | grep '"registry":' | head -n 1 | cut -d '"' -f 4`"
release="`cat $root/package.json | grep '"version":' | awk -F '"' '{print $4}'`"

chain_id="${1:-1337}"

mode="${INDRA_CHAIN_MODE:-local}"
port="${INDRA_CHAIN_PORT:-`expr 8545 - 1337 + $chain_id`}"
tag="${INDRA_TAG:-$chain_id}"
mnemonic="${INDRA_MNEMONIC:-candy maple cake sugar pudding cream honey rich smooth crumble sweet treat}"
engine="${INDRA_EVM:-`if [[ "$chain_id" == "1337" ]]; then echo "ganache"; else echo "buidler"; fi`}"
logLevel="${INDRA_CHAIN_LOG_LEVEL:-0}"

ethprovider_host="${project}_testnet_$tag"

if [[ -n `docker container ls | grep ${ethprovider_host}` ]]
then
  echo "A container called $ethprovider_host already exists"
  exit
fi

chain_data="$root/.chaindata/$chain_id"
mkdir -p $chain_data

if [[ "$mode" == "release" ]]
then image="${registry}/${project}_ethprovider:$release"
elif [[ "$mode" == "staging" ]]
then image="${project}_ethprovider:`git rev-parse HEAD | head -c 8`"
else
  image="${project}_builder"
  arg="modules/contracts/ops/entry.sh"
  opts="--entrypoint bash --mount type=bind,source=$root,target=/root"
fi

docker run $opts \
  --detach \
  --env "CHAIN_ID=$chain_id" \
  --env "ENGINE=$engine" \
  --env "MNEMONIC=$mnemonic" \
  --mount "type=bind,source=$chain_data,target=/data" \
  --name "$ethprovider_host" \
  --publish "$port:8545" \
  --rm \
  --tmpfs "/tmpfs" \
  $image $arg

if [[ "$logLevel" -gt "0" ]]
then docker container logs --follow $ethprovider_host &
fi

while ! curl -s http://localhost:$port > /dev/null
do
  if [[ -z `docker container ls -f name=$ethprovider_host -q` ]]
  then echo "$ethprovider_host was not able to start up successfully" && exit 1
  else sleep 1
  fi
done

while [[ -z "`docker exec $ethprovider_host cat /data/address-book.json | grep $chain_id || true`" ]]
do sleep 1
done

echo "Provider for chain ${chain_id} is awake & ready to go on port ${port}!"
