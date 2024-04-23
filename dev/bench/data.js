window.BENCHMARK_DATA = {
  "lastUpdate": 1713863580321,
  "repoUrl": "https://github.com/RafaelAPB/blockchain-integration-framework",
  "entries": {
    "Benchmark": [
      {
        "commit": {
          "author": {
            "email": "peter.somogyvari@accenture.com",
            "name": "Peter Somogyvari",
            "username": "petermetz"
          },
          "committer": {
            "email": "petermetz@users.noreply.github.com",
            "name": "Peter Somogyvari",
            "username": "petermetz"
          },
          "distinct": true,
          "id": "f71c48e14f9ab83f4508df1dc4fd21642a136984",
          "message": "ci(ci.sh): fix Docker Compose presence check - migrate to sub-command\n\n1. The old way to use docker compose was through the standalone binary\n`docker-compose`\n2. This was working for a while but now the auto-upgrades that we cannot\nseem to avoid have caught up with us and broke ci.sh in the GitHub action\nrunners because the standalone binary is no longer available at all and\ntherefore the migration must happen.\n3. Point 2 is just a theory but one that is considered to be very likely\ncorrect.\n4. It is to be seen if we'll have any other downstream issues such as the\ntests failing in other ways due to this underlying docker change.\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-04-03T06:16:53-07:00",
          "tree_id": "dbf2848880bcf93e04c1b18502fb3e7d8a474253",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/f71c48e14f9ab83f4508df1dc4fd21642a136984"
        },
        "date": 1712156613494,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 573,
            "range": "±1.69%",
            "unit": "ops/sec",
            "extra": "177 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 362,
            "range": "±1.17%",
            "unit": "ops/sec",
            "extra": "181 samples"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "jerome.f.d.occiano@accenture.com",
            "name": "jmoagacn",
            "username": "jmoagacn"
          },
          "committer": {
            "email": "petermetz@users.noreply.github.com",
            "name": "Peter Somogyvari",
            "username": "petermetz"
          },
          "distinct": true,
          "id": "514dc68afc0169cc5c65ac3ed47ffe718617cfb5",
          "message": "chore(connector-quorum): fix CVEs: CVE-2023-36665, CVE-2022-21190\n\nPrimary Changes\n----------------\n1. Modified the Dockerfile to use the updated versions\n   of the packages being used\n\nFixes #2865\n\nSigned-off-by: jmoagacn <jerome.f.d.occiano@accenture.com>",
          "timestamp": "2024-04-18T10:08:29-07:00",
          "tree_id": "368abe379b0937957d826403681e6c78a326ffd5",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/514dc68afc0169cc5c65ac3ed47ffe718617cfb5"
        },
        "date": 1713863578382,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 580,
            "range": "±1.70%",
            "unit": "ops/sec",
            "extra": "177 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 361,
            "range": "±1.24%",
            "unit": "ops/sec",
            "extra": "181 samples"
          }
        ]
      }
    ]
  }
}