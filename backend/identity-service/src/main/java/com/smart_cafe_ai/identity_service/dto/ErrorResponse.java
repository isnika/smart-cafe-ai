package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import java.util.List;

@JsonInclude(JsonInclude.Include.NON_NULL)
public class ErrorResponse {
    private String code;
    private String message;
    private List<ErrorDetail> details;


    public static class ErrorDetail {
        private String field;
        private String issue;
        public static class ErrorDetailBuilder {
            private String field;
            private String issue;
            ErrorDetailBuilder() {
            }

            /**
             * @return {@code this}.
             */
            public ErrorResponse.ErrorDetail.ErrorDetailBuilder field(final String field) {
                this.field = field;
                return this;
            }

            /**
             * @return {@code this}.
             */
            public ErrorResponse.ErrorDetail.ErrorDetailBuilder issue(final String issue) {
                this.issue = issue;
                return this;
            }
            public ErrorResponse.ErrorDetail build() {
                return new ErrorResponse.ErrorDetail(this.field, this.issue);
            }

            @java.lang.Override
            public java.lang.String toString() {
                return "ErrorResponse.ErrorDetail.ErrorDetailBuilder(field=" + this.field + ", issue=" + this.issue + ")";
            }
        }
        public static ErrorResponse.ErrorDetail.ErrorDetailBuilder builder() {
            return new ErrorResponse.ErrorDetail.ErrorDetailBuilder();
        }
        public String getField() {
            return this.field;
        }
        public String getIssue() {
            return this.issue;
        }
        public void setField(final String field) {
            this.field = field;
        }
        public void setIssue(final String issue) {
            this.issue = issue;
        }

        @java.lang.Override
        public boolean equals(final java.lang.Object o) {
            if (o == this) return true;
            if (!(o instanceof ErrorResponse.ErrorDetail)) return false;
            final ErrorResponse.ErrorDetail other = (ErrorResponse.ErrorDetail) o;
            if (!other.canEqual((java.lang.Object) this)) return false;
            final java.lang.Object this$field = this.getField();
            final java.lang.Object other$field = other.getField();
            if (this$field == null ? other$field != null : !this$field.equals(other$field)) return false;
            final java.lang.Object this$issue = this.getIssue();
            final java.lang.Object other$issue = other.getIssue();
            if (this$issue == null ? other$issue != null : !this$issue.equals(other$issue)) return false;
            return true;
        }
        protected boolean canEqual(final java.lang.Object other) {
            return other instanceof ErrorResponse.ErrorDetail;
        }

        @java.lang.Override
        public int hashCode() {
            final int PRIME = 59;
            int result = 1;
            final java.lang.Object $field = this.getField();
            result = result * PRIME + ($field == null ? 43 : $field.hashCode());
            final java.lang.Object $issue = this.getIssue();
            result = result * PRIME + ($issue == null ? 43 : $issue.hashCode());
            return result;
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ErrorResponse.ErrorDetail(field=" + this.getField() + ", issue=" + this.getIssue() + ")";
        }
        public ErrorDetail() {
        }
        public ErrorDetail(final String field, final String issue) {
            this.field = field;
            this.issue = issue;
        }
    }
    public static class ErrorResponseBuilder {
        private String code;
        private String message;
        private List<ErrorDetail> details;
        ErrorResponseBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public ErrorResponse.ErrorResponseBuilder code(final String code) {
            this.code = code;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ErrorResponse.ErrorResponseBuilder message(final String message) {
            this.message = message;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public ErrorResponse.ErrorResponseBuilder details(final List<ErrorDetail> details) {
            this.details = details;
            return this;
        }
        public ErrorResponse build() {
            return new ErrorResponse(this.code, this.message, this.details);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "ErrorResponse.ErrorResponseBuilder(code=" + this.code + ", message=" + this.message + ", details=" + this.details + ")";
        }
    }
    public static ErrorResponse.ErrorResponseBuilder builder() {
        return new ErrorResponse.ErrorResponseBuilder();
    }
    public String getCode() {
        return this.code;
    }
    public String getMessage() {
        return this.message;
    }
    public List<ErrorDetail> getDetails() {
        return this.details;
    }
    public void setCode(final String code) {
        this.code = code;
    }
    public void setMessage(final String message) {
        this.message = message;
    }
    public void setDetails(final List<ErrorDetail> details) {
        this.details = details;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof ErrorResponse)) return false;
        final ErrorResponse other = (ErrorResponse) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        final java.lang.Object this$code = this.getCode();
        final java.lang.Object other$code = other.getCode();
        if (this$code == null ? other$code != null : !this$code.equals(other$code)) return false;
        final java.lang.Object this$message = this.getMessage();
        final java.lang.Object other$message = other.getMessage();
        if (this$message == null ? other$message != null : !this$message.equals(other$message)) return false;
        final java.lang.Object this$details = this.getDetails();
        final java.lang.Object other$details = other.getDetails();
        if (this$details == null ? other$details != null : !this$details.equals(other$details)) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof ErrorResponse;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        final java.lang.Object $code = this.getCode();
        result = result * PRIME + ($code == null ? 43 : $code.hashCode());
        final java.lang.Object $message = this.getMessage();
        result = result * PRIME + ($message == null ? 43 : $message.hashCode());
        final java.lang.Object $details = this.getDetails();
        result = result * PRIME + ($details == null ? 43 : $details.hashCode());
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "ErrorResponse(code=" + this.getCode() + ", message=" + this.getMessage() + ", details=" + this.getDetails() + ")";
    }
    public ErrorResponse() {
    }
    public ErrorResponse(final String code, final String message, final List<ErrorDetail> details) {
        this.code = code;
        this.message = message;
        this.details = details;
    }
}

