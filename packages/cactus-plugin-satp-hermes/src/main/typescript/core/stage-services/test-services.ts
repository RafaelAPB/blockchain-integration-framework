import { ConnectRouter } from "@connectrpc/connect";
<<<<<<< HEAD
// import { Message } from "../../generated/proto/test/message_pb";
=======
import { Message } from "../../generated/proto/test/message_pb";
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
import { TestService } from "../../generated/proto/test/message_connect";

export const testRouter = (router: ConnectRouter) =>
  // registers connectrpc.eliza.v1.ElizaService
  router.service(TestService, {
    // implements rpc Say
    async sendMessage(req) {
      return {
<<<<<<< HEAD
        sentence: `You said: ${req}`,
      };
    },
  });
=======
        sentence: `You said: ${req}`
      }
    },
  });

>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
