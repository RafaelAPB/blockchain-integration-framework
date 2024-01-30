import { Empty } from "@bufbuild/protobuf";
<<<<<<< HEAD
import { Message } from "../../generated/proto/test/message_pb";
import { HandlerContext } from "@connectrpc/connect";

export const TestImplementation2: any = {
  async getMessage(req: Empty, context: HandlerContext): Promise<Message> {
    console.log("Received request", req, context);
    return new Message({
      content: "Hello, SATP!" + "2",
=======
import { Message, ModifyMessageRequest, ModifyMessageResponse } from '../../generated/proto/test/message_pb';
import { HandlerContext } from '@connectrpc/connect';

export const TestImplementation2: any = {
  async getMessage(req: Empty, context: HandlerContext): Promise<Message> {
    console.log("Received request", req);
    return new Message({
        content: "Hello, SATP!" + "2"	
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
    });
  },
};
