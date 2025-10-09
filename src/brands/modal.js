// src/brands/model.js
const mongoose = require("mongoose");

const { Schema } = mongoose;

/* ---------- Subschemas ---------- */
const FeaturedItemSchema = new Schema(
    {
        image: { type: String, trim: true, default: null }, // uploaded path or absolute URL
        title: { type: String, trim: true, required: true },
        description: { type: String, trim: true, default: "" },
        href: { type: String, trim: true, default: "#" },
        order: { type: Number, default: 0 },
    },
    { _id: false }
);

const SimpleCardSchema = new Schema(
    {
        image: { type: String, trim: true, default: null }, // uploaded path or absolute URL
        title: { type: String, trim: true, required: true },
        description: { type: String, trim: true, default: "" },
    },
    { _id: false }
);

const CategoryCountSchema = new Schema(
    {
        title: { type: String, trim: true, required: true },
        subtitle: { type: String, trim: true, default: "" },
    },
    { _id: false }
);

const ReviewSchema = new Schema(
    {
        stars: { type: Number, min: 1, max: 5, required: true },
        message: { type: String, trim: true, required: true },
        person: { type: String, trim: true, required: true },
    },
    { _id: false }
);

/* ---------- Main Schema ---------- */
const BrandSchema = new Schema(
    {
        // Core
        name: { type: String, required: true, trim: true },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true,
            enum: ["asal-tv", "jiil-media", "masrax-production", "nasiye"],
            index: true,
        },
        status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
        order: { type: Number, default: 0, index: true },
        themeKey: { type: String, trim: true, default: "primary" }, // "primary" | "secondary" | "chart-3"
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

        // Hero (dynamic + upload-friendly)
        heroTitle: { type: String, trim: true, required: true },
        heroDescription: { type: String, trim: true, default: "" },
        heroBgImage: { type: String, trim: true, default: null },         // <-- upload path or URL
        heroBgImageMobile: { type: String, trim: true, default: null },   // <-- optional mobile variant

        // About (dynamic + upload-friendly)
        aboutTitle: { type: String, trim: true, required: true },
        aboutDescription: { type: String, trim: true, default: "" },
        aboutImage: { type: String, trim: true, default: null },          // <-- upload path or URL

        // Featured grid (Asal / Jiil / Masrax)
        featuredDescription: { type: String, trim: true, default: "" },
        featuredItems: { type: [FeaturedItemSchema], default: [] },

        /* ---------- Nasiye-only dynamic sections ---------- */
        platformFeaturesDescription: { type: String, trim: true, default: "" },
        platformFeatures: { type: [SimpleCardSchema], default: [] },

        contentCategoriesDescription: { type: String, trim: true, default: "" },
        contentCategories: { type: [CategoryCountSchema], default: [] },

        screenshotTitle: { type: String, trim: true, default: "" },
        screenshotImage: { type: String, trim: true, default: null },     // <-- upload path or URL

        reviewsTitle: { type: String, trim: true, default: "" },
        userReviews: { type: [ReviewSchema], default: [] },
    },
    { timestamps: true }
);

/* ---------- Indexes ---------- */
BrandSchema.index({ status: 1, order: 1 });
BrandSchema.index({ slug: 1, status: 1 });
BrandSchema.index({
    name: "text",
    heroTitle: "text",
    aboutTitle: "text",
    featuredDescription: "text",
    platformFeaturesDescription: "text",
    contentCategoriesDescription: "text",
    reviewsTitle: "text",
});

/* ---------- JSON clean ---------- */
BrandSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("Brand", BrandSchema);
