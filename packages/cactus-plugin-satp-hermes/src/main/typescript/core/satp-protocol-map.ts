/**
 * @fileoverview SATP Protocol Stage and Step Mapping
 *
 * @description
 * Defines the complete execution order of the SATP protocol by mapping stages to
 * steps and steps to specific step tags. This provides a canonical reference for
 * the protocol flow and enables type-safe adapter configuration.
 *
 * The SATP protocol follows a strict order:
 * - Stage 0: Transfer initiation and session negotiation
 * - Stage 1: Asset proposal and transfer commencement
 * - Stage 2: Asset locking and escrow
 * - Stage 3: Commitment, finalization, and completion
 *
 * Each stage contains multiple steps executed by both client and server gateways.
 * Step tags identify specific protocol messages and operations.
 *
 * @module satp-protocol-map
 * @since 0.0.3-beta
 */

import { Stage } from "../types/satp-protocol";

/**
 * SATP stage type - numeric representation (0-3)
 */
export type SatpStage = 0 | 1 | 2 | 3;

/**
 * Step tags for Stage 0 - Transfer Initiation
 */
export type Stage0StepTag =
	| "checkNewSessionRequest"
	| "newSessionResponse"
	| "newSessionRequest"
	| "checkNewSessionResponse"
	| "checkPreSATPTransferRequest"
	| "preSATPTransferResponse"
	| "preSATPTransferRequest"
	| "checkPreSATPTransferResponse";

/**
 * Step tags for Stage 1 - Transfer Proposal and Commencement
 * 
 * Per IETF SATP Core spec section 7, Stage 1 includes:
 * - 7.3-7.5: Transfer Proposal (Request/Receipt/Reject)
 * - 7.6-7.7: Transfer Commence and ACK-Commence Response
 */
export type Stage1StepTag =
	| "transferProposalRequest"
	| "checkTransferProposalRequestMessage"
	| "transferProposalResponse"
	| "checkTransferProposalResponse"
	| "transferCommenceRequest"
	| "checkTransferCommenceRequestMessage"
	| "transferCommenceResponse"
	| "checkTransferCommenceResponse";

/**
 * Step tags for Stage 2 - Asset Locking
 * 
 * Per IETF SATP Core spec section 8, Stage 2 includes:
 * - 8.1: Lock Assertion Message
 * - 8.2: Lock Assertion Receipt Message
 */
export type Stage2StepTag =
	| "lockAsset"
	| "lockAssertionRequest"
	| "checkLockAssertionRequest"
	| "lockAssertionResponse"
	| "checkLockAssertionResponse";

/**
 * Step tags for Stage 3 - Commitment and Finalization
 */
export type Stage3StepTag =
	| "checkCommitPreparationRequest"
	| "commitReadyResponse"
	| "commitPreparation"
	| "checkCommitReadyResponse"
	| "checkCommitFinalAssertionRequest"
	| "commitFinalAcknowledgementReceiptResponse"
	| "commitFinalAssertion"
	| "checkCommitFinalAssertionResponse"
	| "checkTransferCompleteRequest"
	| "transferCompleteResponse"
	| "transferComplete"
	| "checkTransferCompleteResponse"
	| "mintAsset"
	| "assignAsset"
	| "burnAsset";

/**
 * Union type of all SATP step tags across all stages
 */
export type SatpStepTag =
	| Stage0StepTag
	| Stage1StepTag
	| Stage2StepTag
	| Stage3StepTag;

/**
 * Step execution order within a stage (before/during/after/rollback)
 */
export type StepOrder = "before" | "during" | "after" | "rollback";

/**
 * Protocol step definition with metadata
 */
export interface SatpProtocolStep {
	/** Step tag identifier */
	tag: SatpStepTag;
	/** Human-readable description */
	description: string;
	/** Gateway role (client/server/both) */
	role: "client" | "server" | "both";
	/** Sequence number within the stage */
	sequence: number;
}

/**
 * Stage definition with ordered steps
 */
export interface SatpStageDefinition {
	/** Stage number */
	stage: SatpStage;
	/** Stage name */
	name: string;
	/** Ordered list of protocol steps */
	steps: SatpProtocolStep[];
}

/**
 * Complete SATP Protocol Map
 * 
 * Defines the total order of protocol execution across all stages.
 * Each stage contains an ordered sequence of steps executed by client/server gateways.
 * Sequence numbers are monotonically increasing per stage, independent of role.
 */
export const SATP_PROTOCOL_MAP: Record<SatpStage, SatpStageDefinition> = {
	0: {
		stage: 0,
		name: "Transfer Initiation and Negotiation",
		steps: [
			{
				tag: "newSessionRequest",
				description: "Client initiates new session request",
				role: "client",
				sequence: 1,
			},
			{
				tag: "checkNewSessionRequest",
				description: "Server validates new session request from client",
				role: "server",
				sequence: 2,
			},
			{
				tag: "newSessionResponse",
				description: "Server sends new session response",
				role: "server",
				sequence: 3,
			},
			{
				tag: "checkNewSessionResponse",
				description: "Client validates new session response from server",
				role: "client",
				sequence: 4,
			},
			{
				tag: "preSATPTransferRequest",
				description: "Client sends pre-SATP transfer request",
				role: "client",
				sequence: 5,
			},
			{
				tag: "checkPreSATPTransferRequest",
				description: "Server validates pre-SATP transfer request",
				role: "server",
				sequence: 6,
			},
			{
				tag: "preSATPTransferResponse",
				description: "Server sends pre-SATP transfer response",
				role: "server",
				sequence: 7,
			},
			{
				tag: "checkPreSATPTransferResponse",
				description: "Client validates pre-SATP transfer response",
				role: "client",
				sequence: 8,
			},
		],
	},
	1: {
		stage: 1,
		name: "Transfer Proposal and Commencement",
		steps: [
			{
				tag: "transferProposalRequest",
				description: "Client sends transfer proposal request",
				role: "client",
				sequence: 1,
			},
			{
				tag: "checkTransferProposalRequestMessage",
				description: "Server validates transfer proposal from client",
				role: "server",
				sequence: 2,
			},
			{
				tag: "transferProposalResponse",
				description: "Server sends transfer proposal response",
				role: "server",
				sequence: 3,
			},
			{
				tag: "checkTransferProposalResponse",
				description: "Client validates transfer proposal response",
				role: "client",
				sequence: 4,
			},
			{
				tag: "transferCommenceRequest",
				description: "Client sends transfer commence request",
				role: "client",
				sequence: 5,
			},
			{
				tag: "checkTransferCommenceRequestMessage",
				description: "Server validates transfer commence request",
				role: "server",
				sequence: 6,
			},
			{
				tag: "transferCommenceResponse",
				description: "Server sends transfer commence response (ACK-Commence)",
				role: "server",
				sequence: 7,
			},
			{
				tag: "checkTransferCommenceResponse",
				description: "Client validates transfer commence response",
				role: "client",
				sequence: 8,
			},
		],
	},
	2: {
		stage: 2,
		name: "Asset Locking and Escrow",
		steps: [
			{
				tag: "lockAsset",
				description: "Client locks asset in source network",
				role: "client",
				sequence: 1,
			},
			{
				tag: "lockAssertionRequest",
				description: "Client sends lock assertion request",
				role: "client",
				sequence: 2,
			},
			{
				tag: "checkLockAssertionRequest",
				description: "Server validates lock assertion from client",
				role: "server",
				sequence: 3,
			},
			{
				tag: "lockAssertionResponse",
				description: "Server sends lock assertion response (receipt)",
				role: "server",
				sequence: 4,
			},
			{
				tag: "checkLockAssertionResponse",
				description: "Client validates lock assertion response",
				role: "client",
				sequence: 5,
			},
		],
	},
	3: {
		stage: 3,
		name: "Commitment and Finalization",
		steps: [
			{
				tag: "commitPreparation",
				description: "Client prepares for commitment phase",
				role: "client",
				sequence: 1,
			},
			{
				tag: "checkCommitPreparationRequest",
				description: "Server validates commit preparation from client",
				role: "server",
				sequence: 2,
			},
			{
				tag: "mintAsset",
				description: "Server mints asset in destination network",
				role: "server",
				sequence: 3,
			},
			{
				tag: "commitReadyResponse",
				description: "Server sends commit ready response",
				role: "server",
				sequence: 4,
			},
			{
				tag: "checkCommitReadyResponse",
				description: "Client validates commit ready response",
				role: "client",
				sequence: 5,
			},
			{
				tag: "burnAsset",
				description: "Client burns locked asset in source network",
				role: "client",
				sequence: 6,
			},
			{
				tag: "commitFinalAssertion",
				description: "Client sends commit final assertion",
				role: "client",
				sequence: 7,
			},
			{
				tag: "checkCommitFinalAssertionRequest",
				description: "Server validates commit final assertion",
				role: "server",
				sequence: 8,
			},
			{
				tag: "assignAsset",
				description: "Server assigns asset to recipient",
				role: "server",
				sequence: 9,
			},
			{
				tag: "commitFinalAcknowledgementReceiptResponse",
				description: "Server sends commit final acknowledgement",
				role: "server",
				sequence: 10,
			},
			{
				tag: "checkCommitFinalAssertionResponse",
				description: "Client validates commit final assertion response",
				role: "client",
				sequence: 11,
			},
			{
				tag: "transferComplete",
				description: "Client sends transfer complete request",
				role: "client",
				sequence: 12,
			},
			{
				tag: "checkTransferCompleteRequest",
				description: "Server validates transfer complete request",
				role: "server",
				sequence: 13,
			},
			{
				tag: "transferCompleteResponse",
				description: "Server sends transfer complete response",
				role: "server",
				sequence: 14,
			},
			{
				tag: "checkTransferCompleteResponse",
				description: "Client validates transfer complete response",
				role: "client",
				sequence: 15,
			},
		],
	},
};

/**
 * Helper function to get all step tags for a given stage
 */
export function getStepTagsForStage(stage: SatpStage): SatpStepTag[] {
	return SATP_PROTOCOL_MAP[stage].steps.map((step) => step.tag);
}

/**
 * Helper function to get step details by tag
 */
export function getStepByTag(
	stage: SatpStage,
	tag: SatpStepTag,
): SatpProtocolStep | undefined {
	return SATP_PROTOCOL_MAP[stage].steps.find((step) => step.tag === tag);
}

/**
 * Helper function to convert Stage enum to SatpStage number
 */
export function stageEnumToNumber(stage: Stage): SatpStage {
	switch (stage) {
		case Stage.STAGE0:
			return 0;
		case Stage.STAGE1:
			return 1;
		case Stage.STAGE2:
			return 2;
		case Stage.STAGE3:
			return 3;
		default:
			return 0;
	}
}

/**
 * Helper function to convert SatpStage number to Stage enum
 */
export function stageNumberToEnum(stage: SatpStage): Stage {
	switch (stage) {
		case 0:
			return Stage.STAGE0;
		case 1:
			return Stage.STAGE1;
		case 2:
			return Stage.STAGE2;
		case 3:
			return Stage.STAGE3;
	}
}

/**
 * Validates if a step tag belongs to a specific stage
 */
export function isValidStepForStage(
	stage: SatpStage,
	stepTag: string,
): stepTag is SatpStepTag {
	return SATP_PROTOCOL_MAP[stage].steps.some((step) => step.tag === stepTag);
}
