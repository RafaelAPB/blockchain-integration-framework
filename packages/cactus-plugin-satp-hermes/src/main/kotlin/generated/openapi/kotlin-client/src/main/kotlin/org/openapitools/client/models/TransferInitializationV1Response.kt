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


import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * 
 *
 * @param messageType 
 * @param sessionID 
 * @param sequenceNumber 
 * @param initialRequestMessageHash 
 * @param timeStamp 
 * @param processedTimeStamp 
 * @param serverIdentityPubkey 
 * @param signature 
 * @param backupGatewaysAllowed 
 * @param odapPhase 
 * @param destination 
 */


data class TransferInitializationV1Response (

    @Json(name = "messageType")
    val messageType: kotlin.String,

    @Json(name = "sessionID")
    val sessionID: kotlin.String,

    @Json(name = "sequenceNumber")
    val sequenceNumber: java.math.BigDecimal,

    @Json(name = "initialRequestMessageHash")
    val initialRequestMessageHash: kotlin.String,

    @Json(name = "timeStamp")
    val timeStamp: kotlin.String,

    @Json(name = "processedTimeStamp")
    val processedTimeStamp: kotlin.String,

    @Json(name = "serverIdentityPubkey")
    val serverIdentityPubkey: kotlin.String,

    @Json(name = "signature")
    val signature: kotlin.String,

    @Json(name = "backupGatewaysAllowed")
    val backupGatewaysAllowed: kotlin.collections.List<kotlin.String>,

<<<<<<< HEAD:packages/cactus-plugin-odap-hermes/src/main/kotlin/generated/openapi/kotlin-client/src/main/kotlin/org/openapitools/client/models/TransferInitializationV1Response.kt
    @Json(name = "odapPhase")
    val odapPhase: TransferInitializationV1Response.OdapPhase? = null,
=======
    @Json(name = "satpPhase")
    val satpPhase: TransferInitializationV1Response.SatpPhase? = null,
>>>>>>> 0c7d5dd87... feat(bungee): Add skeleton for BUNGEE:packages/cactus-plugin-satp-hermes/src/main/kotlin/generated/openapi/kotlin-client/src/main/kotlin/org/openapitools/client/models/TransferInitializationV1Response.kt

    @Json(name = "destination")
    val destination: kotlin.String? = null

) {

    /**
     * 
     *
     * Values: transferInitialization,lockEvidenceVerification,commitmentEstablishment
     */
    @JsonClass(generateAdapter = false)
    enum class SatpPhase(val value: kotlin.String) {
        @Json(name = "TransferInitialization") transferInitialization("TransferInitialization"),
        @Json(name = "LockEvidenceVerification") lockEvidenceVerification("LockEvidenceVerification"),
        @Json(name = "CommitmentEstablishment") commitmentEstablishment("CommitmentEstablishment");
    }
}

