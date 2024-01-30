import { ConnectRouter } from "@connectrpc/connect";
<<<<<<< HEAD
import { TestService } from "../generated/proto/test/message_connect";
import { TestService2 } from "../generated/proto/test/message_connect";
=======
import { TestService } from '../generated/proto/test/message_connect';
import { TestService2 } from '../generated/proto/test/message_connect';
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)

import { TestImplementation } from "./test/test";
import { TestImplementation2 } from "./test/test2";

export const configureRoutes = (router: ConnectRouter): void => {
<<<<<<< HEAD
  // TODO: add all services and respective implementations
  router.service(TestService, TestImplementation);
  router.service(TestService2, TestImplementation2);
};
=======
    // TODO: add all services and respective implementations
    router.service(TestService, TestImplementation);
    router.service(TestService2, TestImplementation2);
};
>>>>>>> ec7d9e652 (feat(SATP-Hermes): add gateway coordinator WIP)
