/*
CBDC-example backend API

Cactus-Example 

API version: 0.0.2
*/

// Code generated by OpenAPI Generator (https://openapi-generator.tech); DO NOT EDIT.

package generated

import (
	"encoding/json"
	"bytes"
	"fmt"
)

// checks if the SessionReference type satisfies the MappedNullable interface at compile time
var _ MappedNullable = &SessionReference{}

// SessionReference struct for SessionReference
type SessionReference struct {
	Id string `json:"id"`
	Status string `json:"status"`
	SourceLedger string `json:"sourceLedger"`
	ReceiverLedger string `json:"receiverLedger"`
}

type _SessionReference SessionReference

// NewSessionReference instantiates a new SessionReference object
// This constructor will assign default values to properties that have it defined,
// and makes sure properties required by API are set, but the set of arguments
// will change when the set of required properties is changed
func NewSessionReference(id string, status string, sourceLedger string, receiverLedger string) *SessionReference {
	this := SessionReference{}
	this.Id = id
	this.Status = status
	this.SourceLedger = sourceLedger
	this.ReceiverLedger = receiverLedger
	return &this
}

// NewSessionReferenceWithDefaults instantiates a new SessionReference object
// This constructor will only assign default values to properties that have it defined,
// but it doesn't guarantee that properties required by API are set
func NewSessionReferenceWithDefaults() *SessionReference {
	this := SessionReference{}
	return &this
}

// GetId returns the Id field value
func (o *SessionReference) GetId() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.Id
}

// GetIdOk returns a tuple with the Id field value
// and a boolean to check if the value has been set.
func (o *SessionReference) GetIdOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Id, true
}

// SetId sets field value
func (o *SessionReference) SetId(v string) {
	o.Id = v
}

// GetStatus returns the Status field value
func (o *SessionReference) GetStatus() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.Status
}

// GetStatusOk returns a tuple with the Status field value
// and a boolean to check if the value has been set.
func (o *SessionReference) GetStatusOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.Status, true
}

// SetStatus sets field value
func (o *SessionReference) SetStatus(v string) {
	o.Status = v
}

// GetSourceLedger returns the SourceLedger field value
func (o *SessionReference) GetSourceLedger() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.SourceLedger
}

// GetSourceLedgerOk returns a tuple with the SourceLedger field value
// and a boolean to check if the value has been set.
func (o *SessionReference) GetSourceLedgerOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.SourceLedger, true
}

// SetSourceLedger sets field value
func (o *SessionReference) SetSourceLedger(v string) {
	o.SourceLedger = v
}

// GetReceiverLedger returns the ReceiverLedger field value
func (o *SessionReference) GetReceiverLedger() string {
	if o == nil {
		var ret string
		return ret
	}

	return o.ReceiverLedger
}

// GetReceiverLedgerOk returns a tuple with the ReceiverLedger field value
// and a boolean to check if the value has been set.
func (o *SessionReference) GetReceiverLedgerOk() (*string, bool) {
	if o == nil {
		return nil, false
	}
	return &o.ReceiverLedger, true
}

// SetReceiverLedger sets field value
func (o *SessionReference) SetReceiverLedger(v string) {
	o.ReceiverLedger = v
}

func (o SessionReference) MarshalJSON() ([]byte, error) {
	toSerialize,err := o.ToMap()
	if err != nil {
		return []byte{}, err
	}
	return json.Marshal(toSerialize)
}

func (o SessionReference) ToMap() (map[string]interface{}, error) {
	toSerialize := map[string]interface{}{}
	toSerialize["id"] = o.Id
	toSerialize["status"] = o.Status
	toSerialize["sourceLedger"] = o.SourceLedger
	toSerialize["receiverLedger"] = o.ReceiverLedger
	return toSerialize, nil
}

func (o *SessionReference) UnmarshalJSON(data []byte) (err error) {
	// This validates that all required properties are included in the JSON object
	// by unmarshalling the object into a generic map with string keys and checking
	// that every required field exists as a key in the generic map.
	requiredProperties := []string{
		"id",
		"status",
		"sourceLedger",
		"receiverLedger",
	}

	allProperties := make(map[string]interface{})

	err = json.Unmarshal(data, &allProperties)

	if err != nil {
		return err;
	}

	for _, requiredProperty := range(requiredProperties) {
		if _, exists := allProperties[requiredProperty]; !exists {
			return fmt.Errorf("no value given for required property %v", requiredProperty)
		}
	}

	varSessionReference := _SessionReference{}

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	err = decoder.Decode(&varSessionReference)

	if err != nil {
		return err
	}

	*o = SessionReference(varSessionReference)

	return err
}

type NullableSessionReference struct {
	value *SessionReference
	isSet bool
}

func (v NullableSessionReference) Get() *SessionReference {
	return v.value
}

func (v *NullableSessionReference) Set(val *SessionReference) {
	v.value = val
	v.isSet = true
}

func (v NullableSessionReference) IsSet() bool {
	return v.isSet
}

func (v *NullableSessionReference) Unset() {
	v.value = nil
	v.isSet = false
}

func NewNullableSessionReference(val *SessionReference) *NullableSessionReference {
	return &NullableSessionReference{value: val, isSet: true}
}

func (v NullableSessionReference) MarshalJSON() ([]byte, error) {
	return json.Marshal(v.value)
}

func (v *NullableSessionReference) UnmarshalJSON(src []byte) error {
	v.isSet = true
	return json.Unmarshal(src, &v.value)
}


