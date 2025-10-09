const mongoose = require("mongoose");

const CategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        // Extend enum later as needed (e.g., ['service', 'blog', 'product'])
        type: {
            type: String,
            enum: ["service"],
            default: "service",
            required: true,
            index: true,
        },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

// Prevent two categories with the same (type, name)
CategorySchema.index({ type: 1, name: 1 }, { unique: true });

// Clean JSON output
CategorySchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("Category", CategorySchema);
