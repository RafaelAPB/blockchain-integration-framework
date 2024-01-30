/**
 *
 * Please note:
 * This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * Do not edit this file manually.
 *
 */

@file:Suppress(
    "ArrayInDataClass",
    "EnumEntryName",
    "RemoveRedundantQualifierName",
    "UnusedImport"
)

package org.openapitools.client.models

import org.openapitools.client.models.ActionResponse
import org.openapitools.client.models.PayloadProfile

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * 
 *
 * @param messageType Refers to the type of request or response to be conveyed in this message.
 * @param sessionID Unique identifier (UUIDv2) representing a session between two gateways handling a single unidirectional transfer.
 * @param clientIdentityPubkey 
 * @param serverIdentityPubkey 
 * @param hashPrevMessage 
 * @param version SATP protocol Version (major, minor).
 * @param transferContextID Unique optional identifier (UUIDv2) representing the application layer context.
 * @param sequenceNumber Monotonically increasing counter that uniquely represents a message from a session.
 * @param resourceURL Location of Resource to be accessed.
 * @param developerURL Assertion of developer / application identity.
 * @param actionResponse 
 * @param credentialProfile Specify type of auth (SAML, OAuth, X.509)
 * @param credentialBlock Credential token, certificate, string in byte format
 * @param payloadProfile 
 * @param applicationProfile Vendor or Application specific profile.
 * @param payload 
 * @param payloadHash Hash of the current message payload.
 * @param messageSignature Gateway EDCSA signature over the message.
 */


data class LockAssertionMessage (

    /* Refers to the type of request or response to be conveyed in this message. */
    @Json(name = "messageType")
    val messageType: kotlin.String,

    /* Unique identifier (UUIDv2) representing a session between two gateways handling a single unidirectional transfer. */
    @Json(name = "sessionID")
    val sessionID: kotlin.String,

    @Json(name = "clientIdentityPubkey")
    val clientIdentityPubkey: kotlin.String,

    @Json(name = "serverIdentityPubkey")
    val serverIdentityPubkey: kotlin.String,

    @Json(name = "hashPrevMessage")
    val hashPrevMessage: kotlin.String,

    /* SATP protocol Version (major, minor). */
    @Json(name = "version")
    val version: kotlin.String? = null,

    /* Unique optional identifier (UUIDv2) representing the application layer context. */
    @Json(name = "transferContextID")
    val transferContextID: kotlin.String? = null,

    /* Monotonically increasing counter that uniquely represents a message from a session. */
    @Json(name = "sequenceNumber")
    val sequenceNumber: java.math.BigDecimal? = null,

    /* Location of Resource to be accessed. */
    @Json(name = "resourceURL")
    val resourceURL: kotlin.String? = null,

    /* Assertion of developer / application identity. */
    @Json(name = "developerURL")
    val developerURL: kotlin.String? = null,

    @Json(name = "actionResponse")
    val actionResponse: ActionResponse? = null,

    /* Specify type of auth (SAML, OAuth, X.509) */
    @Json(name = "credentialProfile")
    val credentialProfile: LockAssertionMessage.CredentialProfile? = null,

    /* Credential token, certificate, string in byte format */
    @Json(name = "credentialBlock")
    val credentialBlock: kotlin.collections.List<kotlin.ByteArray>? = null,

    @Json(name = "payloadProfile")
    val payloadProfile: PayloadProfile? = null,

    /* Vendor or Application specific profile. */
    @Json(name = "applicationProfile")
    val applicationProfile: kotlin.String? = null,

    @Json(name = "payload")
    val payload: kotlin.Any? = null,

    /* Hash of the current message payload. */
    @Json(name = "payloadHash")
    val payloadHash: kotlin.String? = null,

    /* Gateway EDCSA signature over the message. */
    @Json(name = "messageSignature")
    val messageSignature: kotlin.String? = null

) {

    /**
     * 
     *
     * Values: urnColonIetfColonSatpColonMsgtypeColonLockMinusAssertMinusMsg
     */
    @JsonClass(generateAdapter = false)
    enum class MessageType(val value: kotlin.String) {
        @Json(name = "urn:ietf:satp:msgtype:lock-assert-msg") urnColonIetfColonSatpColonMsgtypeColonLockMinusAssertMinusMsg("urn:ietf:satp:msgtype:lock-assert-msg");
    }
    /**
     * Specify type of auth (SAML, OAuth, X.509)
     *
     * Values: sAML,oAuth,x509
     */
    @JsonClass(generateAdapter = false)
    enum class CredentialProfile(val value: kotlin.String) {
        @Json(name = "SAML") sAML("SAML"),
        @Json(name = "OAuth") oAuth("OAuth"),
        @Json(name = "X509") x509("X509");
    }
}

