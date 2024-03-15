window.BENCHMARK_DATA = {
  "lastUpdate": 1710513271432,
  "repoUrl": "https://github.com/RafaelAPB/blockchain-integration-framework",
  "entries": {
    "Benchmark": [
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
          "id": "f5293ec87f34a07caba9998103022e8837f77a76",
          "message": "build(deps): bump crypto-js\n\nBumps [crypto-js](https://github.com/brix/crypto-js) from 4.1.1 to 4.2.0.\n- [Commits](https://github.com/brix/crypto-js/compare/4.1.1...4.2.0)\n\n---\nupdated-dependencies:\n- dependency-name: crypto-js\n  dependency-type: direct:production\n...\n\nSigned-off-by: dependabot[bot] <support@github.com>",
          "timestamp": "2024-03-14T17:29:00-07:00",
          "tree_id": "8c7b76386095edb44f653291f56f2c54c18198c1",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/f5293ec87f34a07caba9998103022e8837f77a76"
        },
        "date": 1710513269045,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 601,
            "range": "±1.72%",
            "unit": "ops/sec",
            "extra": "178 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 360,
            "range": "±1.91%",
            "unit": "ops/sec",
            "extra": "182 samples"
          }
        ]
      }
    ]
  }
}