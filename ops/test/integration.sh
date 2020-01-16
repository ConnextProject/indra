#!/usr/bin/env bash
set -e

mode="${TEST_MODE:-local}"

dir="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
project="`cat $dir/../../package.json | jq .name | tr -d '"'`"
name="${project}_test_runner"
registry="connextproject"
commit="`git rev-parse HEAD | head -c 8`"
release="`cat package.json | grep '"version":' | awk -F '"' '{print $4}'`"

# If file descriptors 0-2 exist, then we're prob running via interactive shell instead of on CD/CI
if [[ -t 0 && -t 1 && -t 2 ]]
then interactive="--interactive"
fi

if [[ "$mode" == "local" ]]
then

  exec docker run \
    --entrypoint="bash" \
    --env="ECCRYPTO_NO_FALLBACK=true" \
    --env="INDRA_CLIENT_LOG_LEVEL=$LOG_LEVEL" \
    --env="INDRA_ETH_RPC_URL=$ETH_RPC_URL" \
    --env="INDRA_NODE_URL=$NODE_URL" \
    $interactive \
    --name="$name" \
    --mount="type=bind,source=`pwd`,target=/root" \
    --rm \
    --tty \
    ${project}_builder -c "cd modules/test-runner && bash ops/entry.sh $@"

elif [[ "$mode" == "release" ]]
then image=$registry/$name:$release;
elif [[ "$mode" == "staging" ]]
then image=$registry/$name:$commit;
elif [[ -n "`docker image ls -q $name:$1`" ]]
then image=$name:$1; shift # rm $1 from $@
elif [[ -z "$1" || -z "`docker image ls -q $name:$1`" ]]
then
  if [[ -n "`docker image ls -q $name:$commit`" ]]
  then image=$name:$commit
  else image=$name:latest
  fi
else echo "Aborting: couldn't find an image to run for input: $1" && exit 1
fi

echo "Executing image $image"

exec docker run \
  $watchOptions \
  --env="ECCRYPTO_NO_FALLBACK=true" \
  --env="INDRA_CLIENT_LOG_LEVEL=$LOG_LEVEL" \
  --env="INDRA_ETH_RPC_URL=$ETH_RPC_URL" \
  --env="INDRA_NODE_URL=$NODE_URL" \
  $interactive \
  --name="$name" \
  --rm \
  --tty \
  $image $@
