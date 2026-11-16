package com.smart_cafe_ai.identity_service.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PageMeta {
    private int page;
    private int size;
    @JsonProperty("total_items")
    private long totalItems;
    @JsonProperty("total_pages")
    private int totalPages;
    public static class PageMetaBuilder {
        private int page;
        private int size;
        private long totalItems;
        private int totalPages;
        PageMetaBuilder() {
        }

        /**
         * @return {@code this}.
         */
        public PageMeta.PageMetaBuilder page(final int page) {
            this.page = page;
            return this;
        }

        /**
         * @return {@code this}.
         */
        public PageMeta.PageMetaBuilder size(final int size) {
            this.size = size;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("total_items")
        public PageMeta.PageMetaBuilder totalItems(final long totalItems) {
            this.totalItems = totalItems;
            return this;
        }

        /**
         * @return {@code this}.
         */
        @JsonProperty("total_pages")
        public PageMeta.PageMetaBuilder totalPages(final int totalPages) {
            this.totalPages = totalPages;
            return this;
        }
        public PageMeta build() {
            return new PageMeta(this.page, this.size, this.totalItems, this.totalPages);
        }

        @java.lang.Override
        public java.lang.String toString() {
            return "PageMeta.PageMetaBuilder(page=" + this.page + ", size=" + this.size + ", totalItems=" + this.totalItems + ", totalPages=" + this.totalPages + ")";
        }
    }
    public static PageMeta.PageMetaBuilder builder() {
        return new PageMeta.PageMetaBuilder();
    }
    public int getPage() {
        return this.page;
    }
    public int getSize() {
        return this.size;
    }
    public long getTotalItems() {
        return this.totalItems;
    }
    public int getTotalPages() {
        return this.totalPages;
    }
    public void setPage(final int page) {
        this.page = page;
    }
    public void setSize(final int size) {
        this.size = size;
    }
    public void setTotalItems(final long totalItems) {
        this.totalItems = totalItems;
    }
    public void setTotalPages(final int totalPages) {
        this.totalPages = totalPages;
    }

    @java.lang.Override
    public boolean equals(final java.lang.Object o) {
        if (o == this) return true;
        if (!(o instanceof PageMeta)) return false;
        final PageMeta other = (PageMeta) o;
        if (!other.canEqual((java.lang.Object) this)) return false;
        if (this.getPage() != other.getPage()) return false;
        if (this.getSize() != other.getSize()) return false;
        if (this.getTotalItems() != other.getTotalItems()) return false;
        if (this.getTotalPages() != other.getTotalPages()) return false;
        return true;
    }
    protected boolean canEqual(final java.lang.Object other) {
        return other instanceof PageMeta;
    }

    @java.lang.Override
    public int hashCode() {
        final int PRIME = 59;
        int result = 1;
        result = result * PRIME + this.getPage();
        result = result * PRIME + this.getSize();
        final long $totalItems = this.getTotalItems();
        result = result * PRIME + (int) ($totalItems >>> 32 ^ $totalItems);
        result = result * PRIME + this.getTotalPages();
        return result;
    }

    @java.lang.Override
    public java.lang.String toString() {
        return "PageMeta(page=" + this.getPage() + ", size=" + this.getSize() + ", totalItems=" + this.getTotalItems() + ", totalPages=" + this.getTotalPages() + ")";
    }
    public PageMeta() {
    }
    public PageMeta(final int page, final int size, final long totalItems, final int totalPages) {
        this.page = page;
        this.size = size;
        this.totalItems = totalItems;
        this.totalPages = totalPages;
    }
}

