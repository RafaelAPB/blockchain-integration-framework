window.BENCHMARK_DATA = {
  "lastUpdate": 1723218249604,
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
          "distinct": false,
          "id": "d9577b89b6a6cd4ae60318beb60b1f278e3ab53c",
          "message": "build: bump web3-* to v4.2.1 in plugin-htlc-coordinator-besu\n\nBumps [web3-utils](https://github.com/ChainSafe/web3.js) from 4.0.3 to 4.2.1.\n- [Release notes](https://github.com/ChainSafe/web3.js/releases)\n- [Changelog](https://github.com/web3/web3.js/blob/4.x/CHANGELOG.md)\n- [Commits](https://github.com/ChainSafe/web3.js/compare/v4.0.3...v4.2.1)\n\n---\nupdated-dependencies:\n- dependency-name: web3-utils\n  dependency-type: direct:development\n...\n\nCo-authored-by: Peter Somogyvari <peter.somogyvari@accenture.com>\n\nSigned-off-by: dependabot[bot] <support@github.com>\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-05-12T00:04:06-07:00",
          "tree_id": "e49f65a4e1bf3d44eca27356586929ec920c110e",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/d9577b89b6a6cd4ae60318beb60b1f278e3ab53c"
        },
        "date": 1720190829558,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "plugin-ledger-connector-besu_HTTP_GET_getOpenApiSpecV1",
            "value": 757,
            "range": "±3.12%",
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
          "distinct": false,
          "id": "06cb8d02e3cb278f6d33dd175732013d880b4d53",
          "message": "test(connector-corda): fix flow-database-access-v4-8 test case\n\nPrimary Change:\n---------------\n\n1. The test case was broken due to a number of different issues related\nto the AIO image build an also the connector image build, but on top of\nthose problems it also had misconfiguration issues where the port number\nwasn't set to what it should be for the RPC connection that the connector\ncontainer uses to establish communications with the AIO ledger image.\n\nSecondary Change(s):\n---------------------\n1. Fixed 2 bugs in the test tooling package where the port configuration\nwas not randomizing the exposed ports of the corda connector container and\nthe corda test ledger leading to accessibility issues.\n2. Also introduced a createJvmInt(...) utility function on the corda connector\npackage which allows the flowdb test case to construct the flow invocation\nrequests with much less manual labor (manual coding).\n\nIn order to properly verify that this test case is working, a few other\npull requests have to be merged first and container images from those\nsources published as well.\n\nIn addition to the pull request dependencies we also depend on a permission\nissue being resolved in the larger GitHub organization itself as well:\nhttps://github.com/hyperledger/governance/issues/299\n\nDepends on #3386\nDepends on #3387\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-07-10T09:54:41-07:00",
          "tree_id": "bd790ea082ec82df04ce5aca98aa5416c1ece7b8",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/06cb8d02e3cb278f6d33dd175732013d880b4d53"
        },
        "date": 1720633532636,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 590,
            "range": "±1.77%",
            "unit": "ops/sec",
            "extra": "178 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 358,
            "range": "±1.43%",
            "unit": "ops/sec",
            "extra": "180 samples"
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
            "email": "sandeepn.official@gmail.com",
            "name": "Sandeep Nishad",
            "username": "sandeepnRES"
          },
          "distinct": true,
          "id": "1ce7c605778ef4cc53e78e480e70dc48669ebf5b",
          "message": "chore(release): publish v2.0.0-rc.3\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-07-24T17:47:00+05:30",
          "tree_id": "c4097ca89262a035e7a7f101e17e3da0282158a2",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/1ce7c605778ef4cc53e78e480e70dc48669ebf5b"
        },
        "date": 1721831419830,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 581,
            "range": "±1.54%",
            "unit": "ops/sec",
            "extra": "177 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 344,
            "range": "±1.31%",
            "unit": "ops/sec",
            "extra": "180 samples"
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
            "email": "sandeepn.official@gmail.com",
            "name": "Sandeep Nishad",
            "username": "sandeepnRES"
          },
          "distinct": true,
          "id": "1ce7c605778ef4cc53e78e480e70dc48669ebf5b",
          "message": "chore(release): publish v2.0.0-rc.3\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-07-24T17:47:00+05:30",
          "tree_id": "c4097ca89262a035e7a7f101e17e3da0282158a2",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/1ce7c605778ef4cc53e78e480e70dc48669ebf5b"
        },
        "date": 1721831779902,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "plugin-ledger-connector-besu_HTTP_GET_getOpenApiSpecV1",
            "value": 665,
            "range": "±3.36%",
            "unit": "ops/sec",
            "extra": "177 samples"
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
            "email": "sandeepn.official@gmail.com",
            "name": "Sandeep Nishad",
            "username": "sandeepnRES"
          },
          "distinct": true,
          "id": "d0e4539a9b106fa684cd34a6cdb1ff835b870ce4",
          "message": "ci(github): upgrade actions/github-script to 7.0.1 project-wide\n\nFixes #3458\n\nSigned-off-by: Peter Somogyvari <peter.somogyvari@accenture.com>",
          "timestamp": "2024-08-09T05:57:27+05:30",
          "tree_id": "1b12638b0ee30d8845ca2446fe5a82b172922a85",
          "url": "https://github.com/RafaelAPB/blockchain-integration-framework/commit/d0e4539a9b106fa684cd34a6cdb1ff835b870ce4"
        },
        "date": 1723218246654,
        "tool": "benchmarkjs",
        "benches": [
          {
            "name": "cmd-api-server_HTTP_GET_getOpenApiSpecV1",
            "value": 525,
            "range": "±1.68%",
            "unit": "ops/sec",
            "extra": "175 samples"
          },
          {
            "name": "cmd-api-server_gRPC_GetOpenApiSpecV1",
            "value": 303,
            "range": "±1.63%",
            "unit": "ops/sec",
            "extra": "180 samples"
          }
        ]
      }
    ]
  }
}