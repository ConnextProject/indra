[![](https://github.com/ConnextProject/indra/workflows/CD%20Master/badge.svg)](https://github.com/ConnextProject/indra/actions)
[![Discord](https://img.shields.io/discord/454734546869551114)](https://discord.gg/m93Sqf4)
[![Twitter Follow](https://img.shields.io/twitter/follow/ConnextNetwork?style=social)](https://twitter.com/ConnextNetwork)

# Indra 2.0

Connext's new & improved state channel network!

## TL;DR

Make sure the following tools are installed: `make`, `jq`, and `docker` and then run `make start`. This will build everything & launch a pre-configured payment node + a simple UI, play with it from your browser at http://localhost:3000.

Run `bash ops/logs.sh node` to see the node server's logs or replace "node" with one of the other service names, list services with: `make dls` (short for **D**ocker **L**i**s**t).

When you're done playing w it, shut the whole thing down with `make stop`.

## Contents

- [Deploy in dev-mode for local development](#deploy-for-local-development)
- [Deploy to production](#deploying-to-production)
- [How to interact with the Hub](#how-to-interact-with-hub)
- [FAQ](#faq)

If you encounter any problems, check out the [FAQ](#faq) at the bottom of this doc. For any unanswered questions, open an [issue](https://github.com/ConnextProject/indra/issues/new) or reach out on our Discord channel & we'll be happy to help.

Discord Invitation: <https://discord.gg/SmMSFf>

## Deploy for local development

### Prerequisites

- `make`: Probably already installed, otherwise install w `brew install make` or `apt install make` or similar.
- `jq`: Probably not installed yet, install w `brew install jq` or `apt install jq` or similar.
- [`docker`](https://www.docker.com/): sadly, Docker is kinda annoying to install. See website for instructions.

To download this repo, build, and deploy in dev-mode, run the following:

```
git clone https://github.com/ConnextProject/indra.git
cd indra
make start
```

Beware! The first time `make start` is run, it will take a very long time (maybe as long as 20 minutes depending on your internet speed) but have no fear: downloads will be cached & most build steps won't ever need to be repeated again so subsequent `make start` runs will go much more quickly. Get this started asap & browse the rest of the README while the first `make start` completes.

### Interacting with your Local Node

You can interact with the node by browsing to our reference implementation, the Dai Card, available at http://localhost:3000.

Note that the local node runs on a local blockchain (ganache) in a docker container. To test your node, point a wallet to your local chain at http://localhost:8545 and then recover the following "sugar daddy" mnemonic:

`candy maple cake sugar pudding cream honey rich smooth crumble sweet treat`

Then, try sending some Eth to the Dai Card's deposit address (top left of the app).

### Useful Commands

- `make start`: Builds everything & then starts the app
- `make stop`: Stop the app once it's been started
- `make restart`: Stop the app & start it again, rebuilding anything that's out of date
- `make clean`: Stops the app & deletes all build artifacts eg transpiled typescript
- `make reset`: Stops the app & removes all persistent data eg database data
- `make restart-prod`: Restarts the app in production-mode
- `make dls`: Show all running services (groups of containers) plus list all running containers.
- `bash ops/db.sh`: Opens a console attached to the running app's database. You can also run `bash ops/db.sh '\d+'` to run a single PostgreSQL query (eg `\d+` to list table details) and then exit.
- `bash ops/logs.sh node`: Monitor the node's logs. Similar commands can be run to monitor logs for the other services.

### Running Tests

- `make test-cf`: run unit tests for core protocol (cf-core).
- `make test-contracts`: run unit tests for Ethereum smart contracts.
- `make test-client`: run unit tests for our browser client.
- `make test-node`: run unit tests for our node server.
- `make start && make test-daicard`: run integration tests for our daicard UI.
- `make start && make test-integration`: run integration test suite.
- `make start && make watch-ui`: Open a test-optimized browser & use cypress to run automated e2e tests. Tests will be re-run any time test files change.
- `make start && make watch-integration`: start a test watcher that will re-run integration tests whenever test code changes (great to use while debugging).

### Deploying local indra to non-local chains

To start a local indra instance pointed at a non-ganache chain (rinkeby, kovan, etc), run the following:

```bash
export INDRA_ETH_PROVIDER="https://ethprovider.com" # eth provider url (note: this is not a working eth provider, just a sample)
export INDRA_ETH_NETWORK="rinkeby" # string of network
make start
```

## Deploying to Production

### TL;DR

1. Push to staging, make sure CI passes & the staging deployment looks healthy
2. If there are contracts that have changed, delete their addresses from `address-book.json` and redeploy them with `bash ops/deploy-contracts.sh <optional-eth-provider>`
2. If any npm packages have changed, run `bash ops/npm-publish.sh` from staging
3. Run `bash ops/deploy-indra.sh` from staging to merge to master & trigger the deployment to prod

### First, setup GitHub CD Environment Variables

**Once per CD pipeline**

Run `ssh-keygen -t rsa -b 4096 -C "deployer" -m pem -f .ssh/deployer` to generate a new ssh key pair.

Go to GitHub -> Indra Repo -> Settings -> Secrets

- `DOCKER_USER` & `DOCKER_PASSWORD`: Login credentials for someone with push access to the docker repository specified by the `registry` vars at the top of the Makefile & `ops/start-prod.sh`.
- `INDRA_ADMIN_TOKEN`: an admin token for controlling access to sensitive parts of the dashboard.
- `INDRA_AWS_ACCESS_KEY_ID` & `INDRA_AWS_SECRET_ACCESS_KEY`: Login credentials for an AWS storage repo, if provided the database will automatically send DB snapshots to AWS.
- `INDRA_LOGDNA_KEY`: Credentials for LogDNA. If provided, all logs will be sent to this service for further analysis.
- `MAINNET_ETH_PROVIDER` & `RINKEBY_ETH_PROVIDER`: Ethereum RPC Urls eg [Alchemy](https://alchemyapi.io/) or Infura that let us read from/write to the blockchain.

### Second, setup the production server

**Once per server**

 1. Create a new server via AWS or DigitalOcean or whichever is your favorite cloud provider. Note it's IP address.
 2. Set up DNS so that eg the `$RINKEBY_DOMAINNAME` you specified in CI env vars points to this server.
 3. Copy your indra node's mnemonic to your clipboard. You can generate a new random mnemonic from a node console with ethers by doing something like this: `require('ethers').Wallet.createRandom()`
 4. Run the following script (for best results, run it with a `$SERVER_IP` that points to a fresh Ubuntu VM)

`bash ops/setup-ubuntu.sh $SERVER_IP`

To run the setup script, we need to be able to ssh into this server via either `root@$SERVER_IP` or `ubuntu@$SERVER_IP`. If root, this script will setup the ubuntu user and disable root login for security.

This setup script expects to find the private key for ssh access to the server at `~/.ssh/connext-aws` & GitHub's public key at `~/.ssh/deployer.pub`.

This script will load your node's mnemonic into a docker secret stored on the server. You can remove the server's mnemonic like this:

(Make sure that this server doesn't have a node running on it before removing it's key)

```
ssh -t -i ~/.ssh/connext-aws ubuntu@$SERVER_IP docker secret rm indra_mnemonic
```

And add a new private key by re-running the `setup-ubuntu` script. Note: this script is idempotent ie you can run it over and over again w/out causing any problems.

### Third, deploy the contracts

**Once per update to smart contracts**

To deploy the ChannelManager contract & dependencies to Rinkeby:

```
bash ops/deploy.contracts.sh https://rinkeby.infura.io/abc123
```

This script will prompt you to paste in the deployment address's private key if one called `indra_mnemonic` hasn't already been saved to the secret store, this mnemonic will be used to pay gas fees during contract deployment. See saved secrets with `docker secret ls`.

The contract deployment script will save the addresses of your deployed contracts in `modules/contracts/ops/address-book.json`. This file is automatically generated and you probably won't need to mess with it. One exception: if you want to redeploy some contract(s), then delete their addresses from the address book & re-run the above deployment script.

You can upload a custom address book to your prod server's project root like this:

`scp -i ~/.ssh/connext-aws address-book.json ubuntu@$SERVER_IP:~/indra/`

### Fourth, deploy a new version of the connext npm packages

**Once per update to npm packages eg messaging, types, or client**

To publish a new version of the client:

```
bash ops/npm-publish.sh
```

This script will prompt you for a new version number. Heuristics:

- Is this minor bug fix? Then increment the minor version eg `1.0.0` -> `1.0.1`
- Did you add a new, backwards-compatible feature? Then increment the middle version eg `1.0.0` -> `1.1.0`
- Did you add a new, backwards-incompatible feature? Then increment the major version eg `1.0.0` -> `2.0.0`

Once you specify the version, it will automatically:

- update `modules/{packages-to-publish}/package.json` with the new version
- run npm publish
- update `modules/{packages-that-depend-on-newly-published-packages}/package.json` to import the new version of the package
- create & push a new git commit
- create & push a new git tag

### Lastly, deploy a new Indra node

There is a long-lived staging branch that is the intermediate step between Indra development and production. All merges and PRs should be made from a feature branch onto staging. The master branch is dealt with automatically so you shouldn't need to manually commit or merge to master unless you're updating the readme or something that doesn't affect any of the actual source code.

Updating origin/staging will kick off the first round of CI and, if all tests pass, it will deploy the changes to the `$STAGING_URL` configured by your circle ci env.

```
git checkout staging && git mege feature-branch # alternatively, do a code review & merge via a GitHub PR
```

Once the staging branch's CI runs and deploys, check out your staging env. Does everything look good? Seem ready to deploy to production?

To deploy a new Indra node to production, run:

```
bash ops/deploy-indra.sh
```

This script will prompt you for a new version number. See the previous step for versioning heuristics. Once you specify the version, it will automatically:

- merge staging into master
- update the project root's `package.json` with the version you provided & amend this change to the merge commit
- push this commit to origin/master
- create & push a new git tag

Pushing to origin/master will trigger another CI run that will deploy a new Indra node to production if no tests fail.

Monitor the prod node's logs with

```
ssh -i ~/.ssh/connext-aws ubuntu@SERVER_IP bash indra/ops/logs.sh node
```

The ChannelManager contract needs collateral to keep doing its thing. Make sure the node's wallet has enough funds before deploying. Funds can be moved from the node's wallet to the contract manually via:

```
ssh -i ~/.ssh/connext-aws ubuntu@SERVER_IP bash indra/ops/collateralize.sh 3.14 eth
# To move Eth, or to move tokens:
ssh -i ~/.ssh/connext-aws ubuntu@SERVER_IP bash indra/ops/collateralize.sh 1000 token
```

## FAQ

If you encounter problems while the app is running, the first thing to do is check the logs of each component:

- `bash ops/logs.sh node`: Core node logic logs
- `bash ops/logs.sh database`
- `bash ops/logs.sh proxy` 

### `The container name "/indra_buidler" is already in use`

Full error message:

```
docker: Error response from daemon: Conflict. The container name "/indra_buidler" is already in use by container "6d37b932d8047e16f4a8fdf58780fe6974e6beef58bf4cc5e48d00d3e94a67c3". You have to remove (or rename) that container to be able to reuse that name.
```

You probably started to build something and then stopped it with ctrl-c. It only looks like the build stopped: the builder process is still hanging out in the background wrapping up what it was working on. If you wait for a few seconds, this problem will usually go away as the builder finishes & exits.

To speed things up, run `make stop` to tell the builder to hurry up and finish.

### Improperly installed dependencies

You'll notice this by an error that looks like this in some module's logs:

```
2019-03-04T15:13:46.213763000Z internal/modules/cjs/loader.js:718
2019-03-04T15:13:46.213801600Z   return process.dlopen(module, path.toNamespacedPath(filename));
2019-03-04T15:13:46.213822300Z                  ^
2019-03-04T15:13:46.213842600Z
2019-03-04T15:13:46.213862700Z Error: Error loading shared library /root/node_modules/scrypt/build/Release/scrypt.node: Exec format error
2019-03-04T15:13:46.213882900Z     at Object.Module._extensions..node (internal/modules/cjs/loader.js:718:18)
2019-03-04T15:13:46.213903000Z     at Module.load (internal/modules/cjs/loader.js:599:32)
2019-03-04T15:13:46.213923100Z     at tryModuleLoad (internal/modules/cjs/loader.js:538:12)
2019-03-04T15:13:46.213943100Z     at Function.Module._load (internal/modules/cjs/loader.js:530:3)
2019-03-04T15:13:46.213963100Z     at Module.require (internal/modules/cjs/loader.js:637:17)
2019-03-04T15:13:46.213983100Z     at require (internal/modules/cjs/helpers.js:22:18)
2019-03-04T15:13:46.214003200Z     at Object.<anonymous> (/root/node_modules/scrypt/index.js:3:20)
2019-03-04T15:13:46.214023700Z     at Module._compile (internal/modules/cjs/loader.js:689:30)
```

If you noticed this error in the node, for example, you can reinstall dependencies by running `make clean && make start`.

This happen when you run `npm install` manually and then try to deploy the app using docker. Some dependencies (eg scrypt) have pieces in C that need to be compiled. If they get compiled for your local machine, they won't work in docker & vice versa.

### Ethprovider or Ganache not working

```
cat -> curleth.sh <<EOF
#!/bin/bash
url=$ETH_PROVIDER; [[ $url ]] || url=http://localhost:8545
echo "Sending $1 query to provider: $url"
curl -H "Content-Type: application/json" -X POST --data '{"id":31415,"jsonrpc":"2.0","method":"'$1'","params":'$2'}' $url
EOF
```

This lets us do a simple `bash curleth.sh net_version '[]'` as a sanity check to make sure the ethprovider is alive & listening. If not, curl might give more useful errors that direct you towards investigating either metamask or ganache.

One other sanity check is to run `docker service ls` and make sure that you see an ethprovider service that has port 8545 exposed.

You can also run `docker exec -it indra_ethprovider.1.<containerId> bash` to start a shell inside the docker container. Even if there are networking issues between the container & host, you can still ping http://localhost:8545 here to see if ganache is listening & run `ps` to see if it's even alive.

Ganache should dump its logs onto your host and you can print/follow them with: `tail -f modules/contracts/ops/ganache.log` as another way to make sure it's alive. Try deleting this file then running `npm restart` to see if it gets recreated & if so, check to see if there is anything suspicious there

### Have you tried turning it off and back on again?

Restarting: the debugger's most useful tool.

Some problems will be fixed by just restarting the app so try this first: `make restart`

If this doesn't work, try resetting all persistent data (database + the ethprovider's chain data) and starting the app again: `make reset && npm start`. After doing this, you'll likely need to reset your MetaMask account to get your tx nonces synced up correctly.

If that doesn't work either, try rebuilding everything with `make clean && make start`.

### How to generate node db migrations

Typeorm is cool, if we update db entity files then typeorm can generate SQL db migrations from the entity changes.

Start up the stack in a clean state (eg `make clean && make reset && make start`) then something that should look like the following should work:

```
$ cd modules/node && npm run migration:generate foo

> indra-node@4.0.12 migration:generate /home/username/Documents/connext/indra/modules/node
> typeorm migration:generate -d migrations -n  "foo"

Migration /home/username/Documents/connext/indra/modules/node/migrations/1581311685857-foo.ts has been generated successfully.
```

Note: if entity files have *not* changed since the last db migration, the above will print something like "No changes detected" & not generate anything.

Once the migrations are generated, you should skim them & make sure the auto-generated code is sane & doing what you expect it to do. If it looks good, import it & add it to the migrations array in `modules/node/src/database/database.service.ts`.
