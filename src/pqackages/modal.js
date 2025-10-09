// src/packages/model.js
const mongoose = require("mongoose");

const { Schema } = mongoose;

/* ---------- Category sets (match your modal) ---------- */
const CATEGORY_BY_SLUG = Object.freeze({
    religious: ["Ramadan", "Quran", "Scholars", "Charity", "Education", "Iftar"],
    social: ["Initiative", "Youth", "Women", "Campaign", "Diaspora", "Volunteer", "Interfaith"],
    news: ["Platform Launch", "Award", "Production", "Expansion", "Digital", "Partnership", "Infrastructure"],
    sports: ["Football", "Basketball", "Athletics", "Community", "Volleyball", "Festival", "Infrastructure"],
});

const ALL_CATEGORIES = Array.from(
    new Set(Object.values(CATEGORY_BY_SLUG).flat())
);

/* ---------- Subschemas ---------- */
const FeaturedStorySchema = new Schema(
    {
        image: { type: String, trim: true, default: null }, // uploaded path or absolute URL
        title: { type: String, trim: true, required: true },
        description: { type: String, trim: true, required: true },
        author: { type: String, trim: true, required: true },
        date: { type: Date, required: true }, // publish date of the story item
        fullVersion: { type: String, trim: true, required: true }, // full story (read more)

        // NEW: per-story category (validated against slug in parent)
        category: {
            type: String,
            trim: true,
            default: null, // will be defaulted to package.category in pre-validate if missing
        },
    },
    { _id: false }
);

/* ---------- Main Schema ---------- */
const PackageSchema = new Schema(
    {
        // Core
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },

        // Type (as requested, limited to these four)
        slug: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            enum: ["religious", "social", "news", "sports"],
            index: true,
        },

        // Status
        status: { type: String, enum: ["draft", "published"], default: "draft", index: true },

        // Package-level category (still stored; used as default for stories)
        category: {
            type: String,
            trim: true,
            enum: ALL_CATEGORIES,
            index: true,
        },

        // Featured stories (array)
        featuredStories: { type: [FeaturedStorySchema], default: [] },

        // Audit
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

/* ---------- Validation / normalization hooks ---------- */
PackageSchema.pre("validate", function (next) {
    try {
        const pkg = this;
        const allowed = CATEGORY_BY_SLUG[pkg.slug] || ALL_CATEGORIES;

        // Ensure package-level category exists & is allowed for its slug
        if (!pkg.category) {
            pkg.category = allowed[0];
        }
        if (!allowed.includes(pkg.category)) {
            pkg.invalidate(
                "category",
                `Category "${pkg.category}" is not allowed for slug "${pkg.slug}". Allowed: ${allowed.join(", ")}`
            );
        }

        // Ensure each story's category is set & allowed for the slug
        if (Array.isArray(pkg.featuredStories)) {
            pkg.featuredStories.forEach((st, idx) => {
                if (!st.category) {
                    st.category = pkg.category; // default to package category
                }
                if (!allowed.includes(st.category)) {
                    pkg.invalidate(
                        `featuredStories.${idx}.category`,
                        `Category "${st.category}" is not allowed for slug "${pkg.slug}". Allowed: ${allowed.join(", ")}`
                    );
                }
            });
        }

        next();
    } catch (err) {
        next(err);
    }
});

/* ---------- Indexes ---------- */
PackageSchema.index({ status: 1, slug: 1, category: 1, createdAt: -1 });
PackageSchema.index({ "featuredStories.category": 1 });
PackageSchema.index({
    title: "text",
    description: "text",
    "featuredStories.title": "text",
    "featuredStories.description": "text",
    "featuredStories.author": "text",
    "featuredStories.fullVersion": "text",
});

/* ---------- JSON clean ---------- */
PackageSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("Package", PackageSchema);
