package com.smart_cafe_ai.identity_service.dto.user;

import java.util.List;

public class BatchUserRequest {
    private List<String> ids;
    public static class BatchUserRequestBuilder {
        private List<String> ids;
        BatchUserRequestBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public BatchUserRequest.BatchUserRequestBuilder ids(final List<String> ids) {
            this.ids = ids;
            return this;
        }
        public BatchUserRequest build() {
            return new BatchUserRequest(this.ids);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "BatchUserRequest.BatchUserRequestBuilder(ids=" + this.ids + ")";
        }
    }
    public static BatchUserRequest.BatchUserRequestBuilder builder() {
        return new BatchUserRequest.BatchUserRequestBuilder();
    }
    public List<String> getIds() {
        return this.ids;
    }
    public void setIds(final List<String> ids) {
        this.ids = ids;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof BatchUserRequest)) return false;
        final BatchUserRequest other = (BatchUserRequest) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$ids = this.getIds();
        final java.lang.Object other$ids = other.getIds();
        if (this$ids == null ? other$ids != null : !this$ids.equals(other$ids)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof BatchUserRequest;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $ids = this.getIds();
        result = result * PRIME + ($ids == null ? 43 : $ids.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "BatchUserRequest(ids=" + this.getIds() + ")";
    }
    public BatchUserRequest() {
    }
    public BatchUserRequest(final List<String> ids) {
        this.ids = ids;
    }
}

