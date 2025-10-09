// src/services/model.js
const mongoose = require("mongoose");

const ServiceSchema = new mongoose.Schema(
    {

        category: { type: mongoose.Schema.Types.ObjectId, ref: "Category", index: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        features: { type: [String], default: [] },
        image: { type: String, default: null, trim: true },
        order: { type: Number, default: 0, index: true },
        status: { type: String, enum: ["draft", "published"], default: "published", index: true },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

// Helpful indexes
ServiceSchema.index({ category: 1, order: 1 });
ServiceSchema.index({ title: "text", description: "text" });

// Clean JSON output (remove __v)
ServiceSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("Service", ServiceSchema);
