// @generated by protoc-gen-connect-es v1.3.0 with parameter "target=ts,js_import_style=module"
// @generated from file test/message.proto (package test.message, syntax proto3)
/* eslint-disable */
// @ts-nocheck

import { Empty, MethodKind } from "@bufbuild/protobuf";
import { Message, ModifyMessageRequest, ModifyMessageResponse } from "./message_pb.js";

/**
 * @generated from service test.message.TestService
 */
export const TestService = {
  typeName: "test.message.TestService",
  methods: {
    /**
     * @generated from rpc test.message.TestService.GetMessage
     */
    getMessage: {
      name: "GetMessage",
      I: Empty,
      O: Message,
      kind: MethodKind.Unary,
    },
    /**
     * @generated from rpc test.message.TestService.SendMessage
     */
    sendMessage: {
      name: "SendMessage",
      I: Message,
      O: Empty,
      kind: MethodKind.Unary,
    },
    /**
     * @generated from rpc test.message.TestService.ModifyMessage
     */
    modifyMessage: {
      name: "ModifyMessage",
      I: ModifyMessageRequest,
      O: ModifyMessageResponse,
      kind: MethodKind.Unary,
    },
  }
} as const;

