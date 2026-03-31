import { ApplicationFailure, Context } from "@temporalio/activity";
import type { Stage0SATPHandler } from "../../core/stage-handlers/stage0-handler";
import type { Stage1SATPHandler } from "../../core/stage-handlers/stage1-handler";
import type { Stage2SATPHandler } from "../../core/stage-handlers/stage2-handler";
import type { Stage3SATPHandler } from "../../core/stage-handlers/stage3-handler";
import type {
  NewSessionRequest,
  NewSessionResponse,
  PreSATPTransferRequest,
  PreSATPTransferResponse,
} from "../../generated/proto/cacti/satp/v13/service/stage_0_pb";
import type {
  TransferProposalRequest,
  TransferProposalResponse,
  TransferCommenceRequest,
  TransferCommenceResponse,
} from "../../generated/proto/cacti/satp/v13/service/stage_1_pb";
import type {
  LockAssertionRequest,
  LockAssertionResponse,
} from "../../generated/proto/cacti/satp/v13/service/stage_2_pb";
import type {
  CommitPreparationRequest,
  CommitPreparationResponse,
  CommitFinalAssertionRequest,
  CommitFinalAssertionResponse,
  TransferCompleteRequest,
} from "../../generated/proto/cacti/satp/v13/service/stage_3_pb";

/**
 * Forward-path SATP protocol activities.
 *
 * Each activity wraps one stage-handler call in the SATP pipeline so Temporal
 * can provide durable execution and automatic retries.  Handlers follow a
 * pipeline pattern: each step receives the response from the previous step and
 * returns the next request message.
 *
 * Activities are idempotent at the SATP wire level because each message carries
 * a unique session ID and sequence number — a duplicate send is harmless.
 *
 * The compensation (rollback) activities are in crash-recovery-activities.ts.
 */
export function makeProtocolActivities(
  stage0Handler: Stage0SATPHandler,
  stage1Handler: Stage1SATPHandler,
  stage2Handler: Stage2SATPHandler,
  stage3Handler: Stage3SATPHandler,
) {
  return {
    // -----------------------------------------------------------------
    // Stage 0 — Transfer Initiation
    // -----------------------------------------------------------------

    async sendNewSessionRequest(sessionId: string): Promise<NewSessionRequest> {
      Context.current().heartbeat({ stage: "newSession", sessionId });
      try {
        return await stage0Handler.NewSessionRequest(sessionId);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendNewSessionRequest failed: ${String(err)}`,
          type: "NewSessionRequestError",
          nonRetryable: false,
        });
      }
    },

    async sendPreSatpTransferRequest(
      response: NewSessionResponse,
      sessionId: string,
    ): Promise<PreSATPTransferRequest> {
      Context.current().heartbeat({ stage: "preSatpTransfer", sessionId });
      try {
        return await stage0Handler.PreSATPTransferRequest(response, sessionId);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendPreSatpTransferRequest failed: ${String(err)}`,
          type: "PreSatpTransferRequestError",
          nonRetryable: false,
        });
      }
    },

    // -----------------------------------------------------------------
    // Stage 1 — Transfer Proposal
    // -----------------------------------------------------------------

    async sendTransferProposalRequest(
      sessionId: string,
      response: PreSATPTransferResponse,
    ): Promise<TransferProposalRequest> {
      Context.current().heartbeat({ stage: "transferProposal", sessionId });
      try {
        return await stage1Handler.TransferProposalRequest(sessionId, response);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendTransferProposalRequest failed: ${String(err)}`,
          type: "TransferProposalRequestError",
          nonRetryable: false,
        });
      }
    },

    async sendTransferCommenceRequest(
      response: TransferProposalResponse,
    ): Promise<TransferCommenceRequest> {
      Context.current().heartbeat({ stage: "transferCommence" });
      try {
        return await stage1Handler.TransferCommenceRequest(response);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendTransferCommenceRequest failed: ${String(err)}`,
          type: "TransferCommenceRequestError",
          nonRetryable: false,
        });
      }
    },

    // -----------------------------------------------------------------
    // Stage 2 — Lock Assertion
    // -----------------------------------------------------------------

    async sendLockAssertionRequest(
      response: TransferCommenceResponse,
    ): Promise<LockAssertionRequest> {
      Context.current().heartbeat({ stage: "lockAssertion" });
      try {
        return await stage2Handler.LockAssertionRequest(response);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendLockAssertionRequest failed: ${String(err)}`,
          type: "LockAssertionRequestError",
          nonRetryable: false,
        });
      }
    },

    // -----------------------------------------------------------------
    // Stage 3 — Commitment Establishment
    // -----------------------------------------------------------------

    async sendCommitPreparationRequest(
      response: LockAssertionResponse,
    ): Promise<CommitPreparationRequest> {
      Context.current().heartbeat({ stage: "commitPreparation" });
      try {
        return await stage3Handler.CommitPreparationRequest(response);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendCommitPreparationRequest failed: ${String(err)}`,
          type: "CommitPreparationRequestError",
          nonRetryable: false,
        });
      }
    },

    async sendCommitFinalAssertionRequest(
      response: CommitPreparationResponse,
    ): Promise<CommitFinalAssertionRequest> {
      Context.current().heartbeat({ stage: "commitFinalAssertion" });
      try {
        return await stage3Handler.CommitFinalAssertionRequest(response);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendCommitFinalAssertionRequest failed: ${String(err)}`,
          type: "CommitFinalAssertionRequestError",
          nonRetryable: false,
        });
      }
    },

    async sendTransferCompleteRequest(
      response: CommitFinalAssertionResponse,
    ): Promise<TransferCompleteRequest> {
      Context.current().heartbeat({ stage: "transferComplete" });
      try {
        return await stage3Handler.TransferCompleteRequest(response);
      } catch (err) {
        throw ApplicationFailure.create({
          message: `sendTransferCompleteRequest failed: ${String(err)}`,
          type: "TransferCompleteRequestError",
          nonRetryable: false,
        });
      }
    },
  };
}

export type ProtocolActivities = ReturnType<typeof makeProtocolActivities>;
