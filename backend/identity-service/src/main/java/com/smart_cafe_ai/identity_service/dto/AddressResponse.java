package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.smart_cafe_ai.identity_service.model.Address;
import java.math.BigDecimal;
import java.time.LocalDateTime;

public class AddressResponse {
    private Long id;
    @JsonProperty("user_id")
    private String userId;
    private String label;
    @JsonProperty("receiver_name")
    private String receiverName;
    private String phone;
    private String province;
    private String district;
    private String ward;
    @JsonProperty("address_line")
    private String addressLine;
    private BigDecimal latitude;
    private BigDecimal longitude;
    @JsonProperty("is_default")
    private Boolean isDefault;
    @JsonProperty("created_at")
    private LocalDateTime createdAt;
    @JsonProperty("updated_at")
    private LocalDateTime updatedAt;

    public static AddressResponse fromEntity(Address address) {
        if (address == null) {
            return null;
        }
        return AddressResponse.builder().id(address.getId()).userId(address.getUser() != null ? address.getUser().getId() : null).label(address.getLabel()).receiverName(address.getReceiverName()).phone(address.getPhone()).province(address.getProvince()).district(address.getDistrict()).ward(address.getWard()).addressLine(address.getAddressLine()).latitude(address.getLatitude()).longitude(address.getLongitude()).isDefault(address.getIsDefault()).createdAt(address.getCreatedAt()).updatedAt(address.getUpdatedAt()).build();
    }
    public static class AddressResponseBuilder {
        private Long id;
        private String userId;
        private String label;
        private String receiverName;
        private String phone;
        private String province;
        private String district;
        private String ward;
        private String addressLine;
        private BigDecimal latitude;
        private BigDecimal longitude;
        private Boolean isDefault;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        AddressResponseBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("user_id")
        public AddressResponse.AddressResponseBuilder userId(final String userId) {
            this.userId = userId;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder label(final String label) {
            this.label = label;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("receiver_name")
        public AddressResponse.AddressResponseBuilder receiverName(final String receiverName) {
            this.receiverName = receiverName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder province(final String province) {
            this.province = province;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder district(final String district) {
            this.district = district;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder ward(final String ward) {
            this.ward = ward;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("address_line")
        public AddressResponse.AddressResponseBuilder addressLine(final String addressLine) {
            this.addressLine = addressLine;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder latitude(final BigDecimal latitude) {
            this.latitude = latitude;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public AddressResponse.AddressResponseBuilder longitude(final BigDecimal longitude) {
            this.longitude = longitude;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("is_default")
        public AddressResponse.AddressResponseBuilder isDefault(final Boolean isDefault) {
            this.isDefault = isDefault;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("created_at")
        public AddressResponse.AddressResponseBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("updated_at")
        public AddressResponse.AddressResponseBuilder updatedAt(final LocalDateTime updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }
        public AddressResponse build() {
            return new AddressResponse(this.id, this.userId, this.label, this.receiverName, this.phone, this.province, this.district, this.ward, this.addressLine, this.latitude, this.longitude, this.isDefault, this.createdAt, this.updatedAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "AddressResponse.AddressResponseBuilder(id=" + this.id + ", userId=" + this.userId + ", label=" + this.label + ", receiverName=" + this.receiverName + ", phone=" + this.phone + ", province=" + this.province + ", district=" + this.district + ", ward=" + this.ward + ", addressLine=" + this.addressLine + ", latitude=" + this.latitude + ", longitude=" + this.longitude + ", isDefault=" + this.isDefault + ", createdAt=" + this.createdAt + ", updatedAt=" + this.updatedAt + ")";
        }
    }
    public static AddressResponse.AddressResponseBuilder builder() {
        return new AddressResponse.AddressResponseBuilder();
    }
    public Long getId() {
        return this.id;
    }
    public String getUserId() {
        return this.userId;
    }
    public String getLabel() {
        return this.label;
    }
    public String getReceiverName() {
        return this.receiverName;
    }
    public String getPhone() {
        return this.phone;
    }
    public String getProvince() {
        return this.province;
    }
    public String getDistrict() {
        return this.district;
    }
    public String getWard() {
        return this.ward;
    }
    public String getAddressLine() {
        return this.addressLine;
    }
    public BigDecimal getLatitude() {
        return this.latitude;
    }
    public BigDecimal getLongitude() {
        return this.longitude;
    }
    public Boolean getIsDefault() {
        return this.isDefault;
    }
    public LocalDateTime getCreatedAt() {
        return this.createdAt;
    }
    public LocalDateTime getUpdatedAt() {
        return this.updatedAt;
    }
    public void setId(final Long id) {
        this.id = id;
    }
    public void setUserId(final String userId) {
        this.userId = userId;
    }
    public void setLabel(final String label) {
        this.label = label;
    }
    public void setReceiverName(final String receiverName) {
        this.receiverName = receiverName;
    }
    public void setPhone(final String phone) {
        this.phone = phone;
    }
    public void setProvince(final String province) {
        this.province = province;
    }
    public void setDistrict(final String district) {
        this.district = district;
    }
    public void setWard(final String ward) {
        this.ward = ward;
    }
    public void setAddressLine(final String addressLine) {
        this.addressLine = addressLine;
    }
    public void setLatitude(final BigDecimal latitude) {
        this.latitude = latitude;
    }
    public void setLongitude(final BigDecimal longitude) {
        this.longitude = longitude;
    }
    public void setIsDefault(final Boolean isDefault) {
        this.isDefault = isDefault;
    }
    public void setCreatedAt(final LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
    public void setUpdatedAt(final LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof AddressResponse)) return false;
        final AddressResponse other = (AddressResponse) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$id = this.getId();
        final java.lang.Object other$id = other.getId();
        if (this$id == null ? other$id != null : !this$id.equals(other$id)) return false;
        final java.lang.Object this$isDefault = this.getIsDefault();
        final java.lang.Object other$isDefault = other.getIsDefault();
        if (this$isDefault == null ? other$isDefault != null : !this$isDefault.equals(other$isDefault)) return false;
        final java.lang.Object this$userId = this.getUserId();
        final java.lang.Object other$userId = other.getUserId();
        if (this$userId == null ? other$userId != null : !this$userId.equals(other$userId)) return false;
        final java.lang.Object this$label = this.getLabel();
        final java.lang.Object other$label = other.getLabel();
        if (this$label == null ? other$label != null : !this$label.equals(other$label)) return false;
        final java.lang.Object this$receiverName = this.getReceiverName();
        final java.lang.Object other$receiverName = other.getReceiverName();
        if (this$receiverName == null ? other$receiverName != null : !this$receiverName.equals(other$receiverName)) return false;
        final java.lang.Object this$phone = this.getPhone();
        final java.lang.Object other$phone = other.getPhone();
        if (this$phone == null ? other$phone != null : !this$phone.equals(other$phone)) return false;
        final java.lang.Object this$province = this.getProvince();
        final java.lang.Object other$province = other.getProvince();
        if (this$province == null ? other$province != null : !this$province.equals(other$province)) return false;
        final java.lang.Object this$district = this.getDistrict();
        final java.lang.Object other$district = other.getDistrict();
        if (this$district == null ? other$district != null : !this$district.equals(other$district)) return false;
        final java.lang.Object this$ward = this.getWard();
        final java.lang.Object other$ward = other.getWard();
        if (this$ward == null ? other$ward != null : !this$ward.equals(other$ward)) return false;
        final java.lang.Object this$addressLine = this.getAddressLine();
        final java.lang.Object other$addressLine = other.getAddressLine();
        if (this$addressLine == null ? other$addressLine != null : !this$addressLine.equals(other$addressLine)) return false;
        final java.lang.Object this$latitude = this.getLatitude();
        final java.lang.Object other$latitude = other.getLatitude();
        if (this$latitude == null ? other$latitude != null : !this$latitude.equals(other$latitude)) return false;
        final java.lang.Object this$longitude = this.getLongitude();
        final java.lang.Object other$longitude = other.getLongitude();
        if (this$longitude == null ? other$longitude != null : !this$longitude.equals(other$longitude)) return false;
        final java.lang.Object this$createdAt = this.getCreatedAt();
        final java.lang.Object other$createdAt = other.getCreatedAt();
        if (this$createdAt == null ? other$createdAt != null : !this$createdAt.equals(other$createdAt)) return false;
        final java.lang.Object this$updatedAt = this.getUpdatedAt();
        final java.lang.Object other$updatedAt = other.getUpdatedAt();
        if (this$updatedAt == null ? other$updatedAt != null : !this$updatedAt.equals(other$updatedAt)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof AddressResponse;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $id = this.getId();
        result = result * PRIME + ($id == null ? 43 : $id.hashCode());
        final java.lang.Object $isDefault = this.getIsDefault();
        result = result * PRIME + ($isDefault == null ? 43 : $isDefault.hashCode());
        final java.lang.Object $userId = this.getUserId();
        result = result * PRIME + ($userId == null ? 43 : $userId.hashCode());
        final java.lang.Object $label = this.getLabel();
        result = result * PRIME + ($label == null ? 43 : $label.hashCode());
        final java.lang.Object $receiverName = this.getReceiverName();
        result = result * PRIME + ($receiverName == null ? 43 : $receiverName.hashCode());
        final java.lang.Object $phone = this.getPhone();
        result = result * PRIME + ($phone == null ? 43 : $phone.hashCode());
        final java.lang.Object $province = this.getProvince();
        result = result * PRIME + ($province == null ? 43 : $province.hashCode());
        final java.lang.Object $district = this.getDistrict();
        result = result * PRIME + ($district == null ? 43 : $district.hashCode());
        final java.lang.Object $ward = this.getWard();
        result = result * PRIME + ($ward == null ? 43 : $ward.hashCode());
        final java.lang.Object $addressLine = this.getAddressLine();
        result = result * PRIME + ($addressLine == null ? 43 : $addressLine.hashCode());
        final java.lang.Object $latitude = this.getLatitude();
        result = result * PRIME + ($latitude == null ? 43 : $latitude.hashCode());
        final java.lang.Object $longitude = this.getLongitude();
        result = result * PRIME + ($longitude == null ? 43 : $longitude.hashCode());
        final java.lang.Object $createdAt = this.getCreatedAt();
        result = result * PRIME + ($createdAt == null ? 43 : $createdAt.hashCode());
        final java.lang.Object $updatedAt = this.getUpdatedAt();
        result = result * PRIME + ($updatedAt == null ? 43 : $updatedAt.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "AddressResponse(id=" + this.getId() + ", userId=" + this.getUserId() + ", label=" + this.getLabel() + ", receiverName=" + this.getReceiverName() + ", phone=" + this.getPhone() + ", province=" + this.getProvince() + ", district=" + this.getDistrict() + ", ward=" + this.getWard() + ", addressLine=" + this.getAddressLine() + ", latitude=" + this.getLatitude() + ", longitude=" + this.getLongitude() + ", isDefault=" + this.getIsDefault() + ", createdAt=" + this.getCreatedAt() + ", updatedAt=" + this.getUpdatedAt() + ")";
    }
    public AddressResponse() {
    }
    public AddressResponse(final Long id, final String userId, final String label, final String receiverName, final String phone, final String province, final String district, final String ward, final String addressLine, final BigDecimal latitude, final BigDecimal longitude, final Boolean isDefault, final LocalDateTime createdAt, final LocalDateTime updatedAt) {
        this.id = id;
        this.userId = userId;
        this.label = label;
        this.receiverName = receiverName;
        this.phone = phone;
        this.province = province;
        this.district = district;
        this.ward = ward;
        this.addressLine = addressLine;
        this.latitude = latitude;
        this.longitude = longitude;
        this.isDefault = isDefault;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }
}

