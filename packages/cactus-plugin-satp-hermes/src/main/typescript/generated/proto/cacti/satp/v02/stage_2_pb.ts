// @generated by protoc-gen-es v1.7.2 with parameter "target=ts"
// @generated from file cacti/satp/v02/stage_2.proto (package cacti.satp.v02, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import type { BinaryReadOptions, FieldList, JsonReadOptions, JsonValue, PartialMessage, PlainMessage } from "@bufbuild/protobuf";
import { Message, proto3 } from "@bufbuild/protobuf";
import { SATPMessage } from "./common/common_messages_pb.js";

/**
 * @generated from message cacti.satp.v02.LockAssertionClaim
 */
export class LockAssertionClaim extends Message<LockAssertionClaim> {
  constructor(data?: PartialMessage<LockAssertionClaim>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "cacti.satp.v02.LockAssertionClaim";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LockAssertionClaim {
    return new LockAssertionClaim().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LockAssertionClaim {
    return new LockAssertionClaim().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LockAssertionClaim {
    return new LockAssertionClaim().fromJsonString(jsonString, options);
  }

  static equals(a: LockAssertionClaim | PlainMessage<LockAssertionClaim> | undefined, b: LockAssertionClaim | PlainMessage<LockAssertionClaim> | undefined): boolean {
    return proto3.util.equals(LockAssertionClaim, a, b);
  }
}

/**
 * @generated from message cacti.satp.v02.LockAssertionFormat
 */
export class LockAssertionFormat extends Message<LockAssertionFormat> {
  constructor(data?: PartialMessage<LockAssertionFormat>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "cacti.satp.v02.LockAssertionFormat";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LockAssertionFormat {
    return new LockAssertionFormat().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LockAssertionFormat {
    return new LockAssertionFormat().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LockAssertionFormat {
    return new LockAssertionFormat().fromJsonString(jsonString, options);
  }

  static equals(a: LockAssertionFormat | PlainMessage<LockAssertionFormat> | undefined, b: LockAssertionFormat | PlainMessage<LockAssertionFormat> | undefined): boolean {
    return proto3.util.equals(LockAssertionFormat, a, b);
  }
}

/**
 * @generated from message cacti.satp.v02.LockAssertionMessage
 */
export class LockAssertionMessage extends Message<LockAssertionMessage> {
  /**
   * @generated from field: cacti.satp.v02.common.SATPMessage satp_message = 1;
   */
  satpMessage?: SATPMessage;

  /**
   * @generated from field: cacti.satp.v02.LockAssertionClaim lock_assertion_claim = 2;
   */
  lockAssertionClaim?: LockAssertionClaim;

  /**
   * @generated from field: cacti.satp.v02.LockAssertionFormat lock_assertion_format = 3;
   */
  lockAssertionFormat?: LockAssertionFormat;

  /**
   * @generated from field: string lock_assertion_expiration = 4;
   */
  lockAssertionExpiration = "";

  /**
   * @generated from field: string client_transfer_number = 5;
   */
  clientTransferNumber = "";

  /**
   * @generated from field: string client_signature = 6;
   */
  clientSignature = "";

  constructor(data?: PartialMessage<LockAssertionMessage>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "cacti.satp.v02.LockAssertionMessage";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "satp_message", kind: "message", T: SATPMessage },
    { no: 2, name: "lock_assertion_claim", kind: "message", T: LockAssertionClaim },
    { no: 3, name: "lock_assertion_format", kind: "message", T: LockAssertionFormat },
    { no: 4, name: "lock_assertion_expiration", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 5, name: "client_transfer_number", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 6, name: "client_signature", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LockAssertionMessage {
    return new LockAssertionMessage().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LockAssertionMessage {
    return new LockAssertionMessage().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LockAssertionMessage {
    return new LockAssertionMessage().fromJsonString(jsonString, options);
  }

  static equals(a: LockAssertionMessage | PlainMessage<LockAssertionMessage> | undefined, b: LockAssertionMessage | PlainMessage<LockAssertionMessage> | undefined): boolean {
    return proto3.util.equals(LockAssertionMessage, a, b);
  }
}

/**
 * @generated from message cacti.satp.v02.LockAssertionReceiptMessage
 */
export class LockAssertionReceiptMessage extends Message<LockAssertionReceiptMessage> {
  /**
   * @generated from field: cacti.satp.v02.common.SATPMessage satp_message = 1;
   */
  satpMessage?: SATPMessage;

  /**
   * @generated from field: string server_transfer_number = 2;
   */
  serverTransferNumber = "";

  /**
   * @generated from field: string server_signature = 3;
   */
  serverSignature = "";

  constructor(data?: PartialMessage<LockAssertionReceiptMessage>) {
    super();
    proto3.util.initPartial(data, this);
  }

  static readonly runtime: typeof proto3 = proto3;
  static readonly typeName = "cacti.satp.v02.LockAssertionReceiptMessage";
  static readonly fields: FieldList = proto3.util.newFieldList(() => [
    { no: 1, name: "satp_message", kind: "message", T: SATPMessage },
    { no: 2, name: "server_transfer_number", kind: "scalar", T: 9 /* ScalarType.STRING */ },
    { no: 3, name: "server_signature", kind: "scalar", T: 9 /* ScalarType.STRING */ },
  ]);

  static fromBinary(bytes: Uint8Array, options?: Partial<BinaryReadOptions>): LockAssertionReceiptMessage {
    return new LockAssertionReceiptMessage().fromBinary(bytes, options);
  }

  static fromJson(jsonValue: JsonValue, options?: Partial<JsonReadOptions>): LockAssertionReceiptMessage {
    return new LockAssertionReceiptMessage().fromJson(jsonValue, options);
  }

  static fromJsonString(jsonString: string, options?: Partial<JsonReadOptions>): LockAssertionReceiptMessage {
    return new LockAssertionReceiptMessage().fromJsonString(jsonString, options);
  }

  static equals(a: LockAssertionReceiptMessage | PlainMessage<LockAssertionReceiptMessage> | undefined, b: LockAssertionReceiptMessage | PlainMessage<LockAssertionReceiptMessage> | undefined): boolean {
    return proto3.util.equals(LockAssertionReceiptMessage, a, b);
  }
}

