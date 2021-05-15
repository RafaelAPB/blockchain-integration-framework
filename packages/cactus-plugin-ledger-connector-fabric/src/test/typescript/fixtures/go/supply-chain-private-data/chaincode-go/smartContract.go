/*
SPDX-License-Identifier: Apache-2.0
*/

package main

import (
	"log"
	"fmt"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/auction/chaincode-go/smart-contract"
)

func main() {
	log.Println("Init main")
	fmt.Println("Initializing main")
	smartContract, err := contractapi.NewChaincode(&supplychainviews.SmartContract{})
	if err != nil {
		log.Panicf("Error creating auction chaincode: %v", err)
	}

	if err := smartContract.Start(); err != nil {
		log.Panicf("Error starting auction chaincode: %v", err)
	}
}
