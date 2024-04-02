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

import org.openapitools.client.models.GetBlockResponseDecodedV1
import org.openapitools.client.models.GetBlockResponseEncodedV1

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * Response from GetBlock endpoint.
 *
 * @param decodedBlock Full hyperledger fabric block data.
 * @param encodedBlock 
 */


data class GetBlockResponseV1 (

    /* Full hyperledger fabric block data. */
    @Json(name = "decodedBlock")
    val decodedBlock: kotlin.Any?,

    @Json(name = "encodedBlock")
    val encodedBlock: kotlin.String

)
