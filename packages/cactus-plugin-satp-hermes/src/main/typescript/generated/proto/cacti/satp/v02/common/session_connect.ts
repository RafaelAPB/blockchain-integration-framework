// @generated by protoc-gen-connect-es v1.3.0 with parameter "target=ts,js_import_style=module"
// @generated from file cacti/satp/v02/common/session.proto (package cacti.satp.v02.common, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import { Empty, MethodKind } from "@bufbuild/protobuf";
import { SendStatusRequest, SendStatusResponse } from "./session_pb.js";
import { Ack, MessageCore, RollbackMessageCore } from "./common_messages_pb.js";

/**
 * @generated from service cacti.satp.v02.common.SessionStatusService
 */
export const SessionStatusService = {
  typeName: "cacti.satp.v02.common.SessionStatusService",
  methods: {
    /**
     * @generated from rpc cacti.satp.v02.common.SessionStatusService.GetStatus
     */
    getStatus: {
      name: "GetStatus",
      I: Empty,
      O: SendStatusResponse,
      kind: MethodKind.Unary,
    },
    /**
     * @generated from rpc cacti.satp.v02.common.SessionStatusService.SendStatus
     */
    sendStatus: {
      name: "SendStatus",
      I: SendStatusRequest,
      O: Empty,
      kind: MethodKind.Unary,
    },
  }
} as const;

/**
 * TODO: define common RPC methods for each step. This is a draft
 *
 * @generated from service cacti.satp.v02.common.CommonService
 */
export const CommonService = {
  typeName: "cacti.satp.v02.common.CommonService",
  methods: {
    /**
     * @generated from rpc cacti.satp.v02.common.CommonService.Ping
     */
    ping: {
      name: "Ping",
      I: Empty,
      O: MessageCore,
      kind: MethodKind.Unary,
    },
    /**
     * @generated from rpc cacti.satp.v02.common.CommonService.Rollback
     */
    rollback: {
      name: "Rollback",
      I: Empty,
      O: RollbackMessageCore,
      kind: MethodKind.Unary,
    },
    /**
     * @generated from rpc cacti.satp.v02.common.CommonService.GetStageVersion
     */
    getStageVersion: {
      name: "GetStageVersion",
      I: Empty,
      O: Ack,
      kind: MethodKind.Unary,
    },
  }
} as const;

