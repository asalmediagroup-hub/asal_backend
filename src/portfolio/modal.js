// src/portfolio/model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ---------- Constants ---------- */
const PORTFOLIO_CATEGORIES = [
    "Documentary",
    "Digital Content",
    "Commercial",
    "Streaming Content",
    "Life Event",
    "Web Series",
];

/* ---------- Subschema ---------- */
const PortfolioItemSchema = new Schema(
    {
        image: { type: String, trim: true, default: null }, // upload path or absolute URL; null allowed
        title: { type: String, trim: true, required: true },
        description: { type: String, trim: true, required: true },
        date: { type: Date, required: true }, // e.g., project completion/launch date
        category: {
            type: String,
            enum: PORTFOLIO_CATEGORIES,
            required: true,
            trim: true,
        },
        video: { type: String, trim: true, default: "" },   // optional: YouTube/Vimeo/direct
        text: { type: String, trim: true, default: "" },    // optional long-form/write-up
    },
    { _id: false }
);

/* ---------- Main Schema ---------- */
const PortfolioSchema = new Schema(
    {
        title: { type: String, trim: true, required: true },        // page title
        description: { type: String, trim: true, default: "" },     // page intro/summary
        items: { type: [PortfolioItemSchema], default: [] },        // portfolio entries
    },
    { timestamps: true }
);

/* ---------- Helpful Index (optional) ---------- */
PortfolioSchema.index({
    title: "text",
    description: "text",
    "items.title": "text",
    "items.description": "text",
    "items.category": "text",
});

/* ---------- JSON clean ---------- */
PortfolioSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("Portfolio", PortfolioSchema);
module.exports.PORTFOLIO_CATEGORIES = PORTFOLIO_CATEGORIES;
