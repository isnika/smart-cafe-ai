package com.smart_cafe_ai.catalog_service.validation;

import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.Expression;
import java.text.Normalizer;
import java.util.Locale;

/** The same fixed Vietnamese folding rules apply to SQL names and the search term. */
public final class VietnameseNameSearch {
    private static final String[][] VOWELS = {
            {"[àáảãạăằắẳẵặâầấẩẫậ]", "a"},
            {"[èéẻẽẹêềếểễệ]", "e"},
            {"[ìíỉĩị]", "i"},
            {"[òóỏõọôồốổỗộơờớởỡợ]", "o"},
            {"[ùúủũụưừứửữự]", "u"},
            {"[ỳýỷỹỵ]", "y"}
    };
    private static final String COMBINING_MARKS = "[" + (char) 0x0300 + "-" + (char) 0x036f + "]";

    private VietnameseNameSearch() {}

    public static String fold(String value) {
        String result = Normalizer.normalize(value, Normalizer.Form.NFC).toLowerCase(Locale.ROOT);
        for (String[] vowel : VOWELS) result = result.replaceAll(vowel[0], vowel[1]);
        return result.replace('đ', 'd').replaceAll(COMBINING_MARKS, "");
    }

    public static Expression<String> expression(CriteriaBuilder cb, Expression<String> name) {
        Expression<String> result = cb.lower(name);
        for (String[] vowel : VOWELS) {
            result = cb.function("regexp_replace", String.class, result, cb.literal(vowel[0]), cb.literal(vowel[1]));
        }
        result = cb.function("replace", String.class, result, cb.literal("đ"), cb.literal("d"));
        return cb.function("regexp_replace", String.class, result, cb.literal(COMBINING_MARKS), cb.literal(""));
    }
}
