import { ConnectRouter } from "@connectrpc/connect";
import { TestService } from "../generated/proto/test/message_connect";
import { TestService2 } from "../generated/proto/test/message_connect";

import { TestImplementation } from "./test/test";
import { TestImplementation2 } from "./test/test2";
import { SatpStage1Service } from "../generated/proto/cacti/satp/v02/stage_1_connect";
import { sendTransferProposalRequest } from "../core/stage-services/stage1";

export const configureRoutes = (router: ConnectRouter): void => {
  // TODO: add all services and respective implementations
  router.service(TestService, TestImplementation);
  router.service(TestService2, TestImplementation2);

  router.service(SatpStage1Service, sendTransferProposalRequest);
};
