import { Empty } from "@bufbuild/protobuf";
<<<<<<< HEAD
import {
  Message,
  ModifyMessageRequest,
  ModifyMessageResponse,
} from "../../generated/proto/test/message_pb";
import { HandlerContext } from "@connectrpc/connect";
=======
import { Message, ModifyMessageRequest, ModifyMessageResponse } from '../../generated/proto/test/message_pb';
import { HandlerContext } from '@connectrpc/connect';
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)

// TODO: investigate how we can get type security, without doing the following:
/* 
interface ITestServiceImplementation {
    getMessage(req: Empty): Promise<Message>;
    sendMessage(req: Message): Promise<Empty>;
    modifyMessage(req: ModifyMessageRequest): Promise<ModifyMessageResponse>;
}

const TestImplementation: ITestServiceImplementation = {

    */

// TODO: inject logger from gateway?

export const TestImplementation: any = {
  async getMessage(req: Empty, context: HandlerContext): Promise<Message> {
<<<<<<< HEAD
    console.log("Received request", req, context);
    return new Message({
      content: "Hello, SATP!",
    });
  },
  async sendMessage(req: Message): Promise<Empty> {
    console.log("Received request", req);
    return new Empty();
  },
  async modifyMessage(
    req: ModifyMessageRequest,
  ): Promise<ModifyMessageResponse> {
    console.log("Received request", req);
    return new ModifyMessageResponse({
      content: "You said " + req.content,
=======
    console.log("Received request", req);
    return new Message({
        content: "Hello, SATP!"
    });
  },
    async sendMessage(req: Message): Promise<Empty> {
        console.log("Received request", req);
        return new Empty();
    },
    async modifyMessage(req: ModifyMessageRequest): Promise<ModifyMessageResponse> {
        console.log("Received request", req);
        return new ModifyMessageResponse({
        content: "You said " + req.content
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
    });
  },
};
