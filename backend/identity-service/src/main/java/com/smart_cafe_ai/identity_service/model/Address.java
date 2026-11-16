package com.smart_cafe_ai.identity_service.model;

import jakarta.persistence.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "Addresses")
public class Address {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;
    @Column(length = 50)
    private String label;
    @Column(name = "receiver_name", nullable = false, length = 100)
    private String receiverName;
    @Column(nullable = false, length = 20)
    private String phone;
    @Column(nullable = false, length = 100)
    private String province;
    @Column(length = 100)
    private String district;
    @Column(nullable = false, length = 100)
    private String ward;
    @Column(name = "address_line", nullable = false, length = 255)
    private String addressLine;
    @Column(name = "latitude", precision = 10, scale = 7)
    private BigDecimal latitude;
    @Column(name = "longitude", precision = 10, scale = 7)
    private BigDecimal longitude;
    @Column(name = "is_default")
    private Boolean isDefault;
    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;
    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
    private static Boolean $default$isDefault() {
        return false;
    }
    public static class AddressBuilder {
        private Long id;
        private User user;
        private String label;
        private String receiverName;
        private String phone;
        private String province;
        private String district;
        private String ward;
        private String addressLine;
        private BigDecimal latitude;
        private BigDecimal longitude;
        private boolean isDefault$set;
        private Boolean isDefault$value;
        private LocalDateTime createdAt;
        private LocalDateTime updatedAt;
        AddressBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder id(final Long id) {
            this.id = id;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder user(final User user) {
            this.user = user;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder label(final String label) {
            this.label = label;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder receiverName(final String receiverName) {
            this.receiverName = receiverName;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder phone(final String phone) {
            this.phone = phone;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder province(final String province) {
            this.province = province;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder district(final String district) {
            this.district = district;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder ward(final String ward) {
            this.ward = ward;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder addressLine(final String addressLine) {
            this.addressLine = addressLine;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder latitude(final BigDecimal latitude) {
            this.latitude = latitude;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder longitude(final BigDecimal longitude) {
            this.longitude = longitude;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder isDefault(final Boolean isDefault) {
            this.isDefault$value = isDefault;
            isDefault$set = true;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder createdAt(final LocalDateTime createdAt) {
            this.createdAt = createdAt;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public Address.AddressBuilder updatedAt(final LocalDateTime updatedAt) {
            this.updatedAt = updatedAt;
            return this;
        }
        public Address build() {
            Boolean isDefault$value = this.isDefault$value;
            if (!this.isDefault$set) isDefault$value = Address.$default$isDefault();
            return new Address(this.id, this.user, this.label, this.receiverName, this.phone, this.province, this.district, this.ward, this.addressLine, this.latitude, this.longitude, isDefault$value, this.createdAt, this.updatedAt);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "Address.AddressBuilder(id=" + this.id + ", user=" + this.user + ", label=" + this.label + ", receiverName=" + this.receiverName + ", phone=" + this.phone + ", province=" + this.province + ", district=" + this.district + ", ward=" + this.ward + ", addressLine=" + this.addressLine + ", latitude=" + this.latitude + ", longitude=" + this.longitude + ", isDefault$value=" + this.isDefault$value + ", createdAt=" + this.createdAt + ", updatedAt=" + this.updatedAt + ")";
        }
    }
    public static Address.AddressBuilder builder() {
        return new Address.AddressBuilder();
    }
    public Long getId() {
        return this.id;
    }
    public User getUser() {
        return this.user;
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
    public void setUser(final User user) {
        this.user = user;
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
    public Address() {
        this.isDefault = Address.$default$isDefault();
    }
    public Address(final Long id, final User user, final String label, final String receiverName, final String phone, final String province, final String district, final String ward, final String addressLine, final BigDecimal latitude, final BigDecimal longitude, final Boolean isDefault, final LocalDateTime createdAt, final LocalDateTime updatedAt) {
        this.id = id;
        this.user = user;
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

