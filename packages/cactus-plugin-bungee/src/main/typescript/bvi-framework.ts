/* eslint-disable @typescript-eslint/no-explicit-any */
/*

A View 

*/

export interface Identity {
  id: any;
  credential: any;
}

export interface StateTransitionFunctionParameter {
  apply(): any;
}

type StateTransitionFunction = (
  value: StateTransitionFunctionParameter,
) => void;

export interface MergeParameters {
  action: string;
}

// A snapshot is a collection of states
export class Snapshot {
  private states: State[];
  private owner: Identity;
  private timestamp: Date;
  private id!: string;

  constructor(states: State[], owner: Identity) {
    this.timestamp = new Date();
    this.states = states;
    this.owner = owner;
  }

  getId(): string {
    return this.id;
  }
}

export class BlockchainView {
  constructor() {
    //generate view
  }

  validateView(): boolean {
    return false;
  }
}

export class Transaction {}

export class State {
  private key: string;
  private value: string;

  constructor(key: string, value: string) {
    this.key = key;
    this.value = value;
  }

  stateTransition(initialState: State, tx: Transaction): State {
    tx;
    initialState;
    return new State("null", "null");
  }

  stateVerification(state: State): boolean {
    state;
    return false;
  }

  //apply
  applyStateTransition(func: StateTransitionFunction, value: string): any {
    return func.prototype.call(value);
  }
}

enum Protocol {
  "Bitcoin",
  "Ethereum",
  "Hyperledger Fabric",
}

enum ProofType {
  "ZKP",
  "Notary",
  "SPV",
}

enum SerializationFormat {
  "JSON",
}

export type ViewHeader = {
  viewId: string;
  ledgerId: string;
  protocol: Protocol;
  // Singleton, collection, computation
  type: string;
  // Global vs local clock?
  timestamp: Date;
  proofType: ProofType;
  serializationFormat: SerializationFormat;
  //Include commitmments done to this view?
  //Encoded payload of a view
};

export type View = {
  //IPLD compatible format
  header: ViewHeader;

  //might be private?
  payload: any;
};

// https://refactoring.guru/design-patterns/adapter/typescript/example
//The driver is responsible for all communication between BUNGEE and its network.
