window.BENCHMARK_DATA = {
  "lastUpdate": 1709554022952,
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
          "id": "0804bab4c9b43f2e22be6d77be127415a9a0532f",
          "message": "perf(cmd-api-server): add demonstration of continuous benchmarking\n\nPrimary change:\n---------------\n\nThis is the ice-breaker for some work that got stuck related to this issue:\nhttps://github.com/hyperledger/cacti/issues/2672\n\nThe used benchamking library (benchmark.js) is old but solid and has\nalmost no dependencies which means that we'll be in the clear longer term\nwhen it comes to CVEs popping up.\n\nThe benchmarks added here are very simple and measure the throughput of\nthe API server's Open API spec providing endpoints.\n\nThe GitHub action that we use is designed to do regression detection and\nreporting but this is hard to verify before actually putting it in place\nas we cannot simulate the CI environment's clone on a local environment.\n\nThe hope is that this change will make it so that if someone tries to\nmake a code change that will lower performance significantly, then we\ncan catch that at the review stage instead of having to find out later.\n\nSecondary change:\n-----------------\n\n1. Started using tsx in favor of ts-node because it appers to be about\n5% faster when looking at the benchmark execution. It also claims to have\nless problems with ESM compared to ts-node so if this initial trial\ngoes well we could later on decide to swap out ts-node with it project-wide.\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-02-02T00:09:44-08:00",
          "tree_id": "741d7ddf0400698b2fdfb3d8ac58c18e884a4afe",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/0804bab4c9b43f2e22be6d77be127415a9a0532f"
        },
        "date": 1706866294069,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 608,
            "range": "±1.75%",
            "unit": "ops/sec",
            "extra": "177 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 381,
            "range": "±1.24%",
            "unit": "ops/sec",
            "extra": "182 samples"
          }
        ]
      },
      {
        "commit": {
          "author": {
            "email": "49699333+dependabot[bot]@users.noreply.github.com",
            "name": "dependabot[bot]",
            "username": "dependabot[bot]"
          },
          "committer": {
            "email": "petermetz@users.noreply.github.com",
            "name": "Peter Somogyvari",
            "username": "petermetz"
          },
          "distinct": true,
          "id": "ffaeffb243e64916dd7c01c3eef8cc2d1e6df9d1",
          "message": "build(connector-polkadot): bump axios to v1.6.0\n\nBumps [axios](https://github.com/axios/axios) from 0.22.0 to 1.6.0.\n- [Release notes](https://github.com/axios/axios/releases)\n- [Changelog](https://github.com/axios/axios/blob/v1.6.0/CHANGELOG.md)\n- [Commits](https://github.com/axios/axios/compare/v0.22.0...v1.6.0)\n\n---\nupdated-dependencies:\n- dependency-name: axios\n  dependency-type: direct:development\n...\n\nCo-authored-by: Peter Somogyvari <peter.somogyvari@accenture.com>\n\nSigned-off-by: dependabot[bot] <support@github.com>\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-02-28T13:06:04-08:00",
          "tree_id": "3beba0d4de5b77b97250021c63c205416679b08f",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/ffaeffb243e64916dd7c01c3eef8cc2d1e6df9d1"
        },
        "date": 1709197199901,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 622,
            "range": "±1.59%",
            "unit": "ops/sec",
            "extra": "179 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 386,
            "range": "±1.48%",
            "unit": "ops/sec",
            "extra": "182 samples"
          }
        ]
      },
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
          "id": "f02a0aaf8383557bb0b1a01b3e60746730599345",
          "message": "build(deps): project-wide upgrade to uuid@9.0.2 and @types/uuid@9.0.8\n\nQuality of life dependency consolidation and regular maintenance.\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-03-04T00:15:42-08:00",
          "tree_id": "4120dc70f8c760db4b1aa09883342553f1e7d31e",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/f02a0aaf8383557bb0b1a01b3e60746730599345"
        },
        "date": 1709554021420,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 616,
            "range": "±1.89%",
            "unit": "ops/sec",
            "extra": "179 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 383,
            "range": "±1.20%",
            "unit": "ops/sec",
            "extra": "184 samples"
          }
        ]
      }
    ]
  }
}