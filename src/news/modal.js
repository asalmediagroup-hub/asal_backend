// src/news/model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

/* ---------- Subschema: News Item ---------- */
const NewsItemSchema = new Schema(
    {
        date: { type: Date, required: true, index: true },               // publish date of the item
        author: { type: String, trim: true, default: "News Desk" },
        title: { type: String, trim: true, required: true },
        image: { type: String, trim: true, default: null },              // uploaded path or absolute URL
        description: { type: String, trim: true, default: "" },          // short teaser
        fullNews: { type: String, trim: true, required: true },          // full body (rich text/HTML ok)
        order: { type: Number, default: 0 },                              // optional manual ordering
    },
    { _id: false }
);

/* ---------- Main Schema ---------- */
const NewsSchema = new Schema(
    {
        // Core
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: "" },

        // Management (optional but handy, mirrors your Brand schema style)
        status: { type: String, enum: ["draft", "published"], default: "draft", index: true },
        order: { type: Number, default: 0, index: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },

        // Collection of news items
        items: { type: [NewsItemSchema], default: [] },
    },
    { timestamps: true }
);

/* ---------- Indexes ---------- */
NewsSchema.index({ status: 1, order: 1, updatedAt: -1 });
NewsSchema.index({ "items.date": -1 });
NewsSchema.index({
    title: "text",
    description: "text",
    "items.title": "text",
    "items.description": "text",
});

/* ---------- JSON clean ---------- */
NewsSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("News", NewsSchema);
