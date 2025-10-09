// src/partnersReviews/model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ---------- Subschema: Partner Review Item ---------- */
const PartnerReviewItemSchema = new Schema(
    {
        image: { type: String, trim: true, default: null },           // optional image (path or URL)
        title: { type: String, trim: true, default: "" },             // optional short title/subject
        message: { type: String, trim: true, required: true },
        authorName: { type: String, trim: true, required: true },
        starsNo: {
            type: Number,
            required: true,
            min: [1, "starsNo must be at least 1"],
            max: [5, "starsNo cannot exceed 5"],
            validate: {
                validator: Number.isInteger,
                message: "starsNo must be an integer between 1 and 5",
            },
        },
    },
    { _id: false }
);

/* ---------- Main Schema ---------- */
const PartnersReviewSchema = new Schema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: "" },
        status: { type: String, enum: ["draft", "published"], default: "draft", index: true },

        // Filled automatically from req.user in controller
        createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

        // Array of partner reviews
        items: { type: [PartnerReviewItemSchema], default: [] },
    },
    { timestamps: true }
);

/* ---------- Indexes ---------- */
PartnersReviewSchema.index({ status: 1, createdBy: 1, createdAt: -1 });
PartnersReviewSchema.index({
    title: "text",
    description: "text",
    "items.message": "text",
    "items.authorName": "text",
});

/* ---------- JSON clean ---------- */
PartnersReviewSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("PartnersReview", PartnersReviewSchema);
