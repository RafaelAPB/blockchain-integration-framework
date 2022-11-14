# Hyperledger Cacti Workshop Examples repo

This folder contains several simple examples using different components of Hyperledger Cacti that are used in the first Hyperledger workshop dedicated to interoperability, using Cacti: https://wiki.hyperledger.org/display/events/Blockchain+Interoperability+with+Hyperledger+Cacti

## Hyperledger Cacti Workshop Examples - Hello World
WARNING: This code IS NOT production-ready nor secure! Namely, cross-site scripting is possible if user input is not sanitized.

``src/main/typescript/hello-world.ts``

Creates an APIServer and a Keychain Memory client. The server interacts with the key pairs in the Keychain Memory.

Runs with the following command ``npx ts-node src/main/typescript/hello-world.ts``

The implemented interactions are:
- POST "/set-kcm", which sets a new key-value pair.
    ```
    curl --header "Content-Type: application/json" \
        --request POST \
        --data '{"key":"1234","value":"xyz"}' \
        http://localhost:8000/set-kcm
    ```
- GET "/get-kcm/:key", which gets a key-value pair.
    ```
    curl --header "Content-Type: application/json" \
        --request GET \
        --data '{"key":"1234"}' \
        http://localhost:8000/get-kcm/1234
    ```
- DELETE "/delete/:key", which deletes a key-value pair.
    ```
    curl --header "Content-Type: application/json" \
        --request POST \
        --data '{"key":"1234"}' \
        http://localhost:8000/delete-kcm/1234
    ```
- GET "/has-key/:key", which checks if a key-value pair exits in the client.
    ```
    curl --header "Content-Type: application/json" \
        --request GET \
        --data '{"key":"1234"}' \
        http://localhost:8000/has-key/1234
    ```

## Hyperledger Cacti Workshop Examples - Simple Consortium

``src/main/typescript/test-ledger.ts``

Creates a simple Cacti Consortium.

Runs with the following command ``npx ts-node src/main/typescript/simple-consortium.ts``

## Hyperledger Cacti Workshop Examples - Substrate test ledger

``src/main/typescript/test-ledger.ts``

Creates a substrate test ledger programmatically.

Runs with the following command ``npx ts-node src/main/typescript/test-ledger.ts``

## Known issues
This example package works with version 1.0.0 of ``@hyperledger/cactus-test-tooling``. It will work with the most recent version once #2213 is resolved.

## Authors

- Rafael Belchior
- Mónica Gomez
- Abhinav Srivastava