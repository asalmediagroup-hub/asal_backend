// src/home/modal.js
const mongoose = require("mongoose");

const { Schema } = mongoose;

/* ---------- Subschemas ---------- */
const ServicePreviewSchema = new Schema(
    {
        title: { type: String, trim: true, required: true },
        description: { type: String, trim: true, required: true },
        keyServices: { type: [String], required: true, default: [] },
    },
    { _id: false }
);

/* ---------- Main Schema ---------- */
const HomeSchema = new Schema(
    {
        siteName: { type: String, required: true, trim: true },
        logoImage: { type: String, required: true, trim: true },
        brandsPreviewImage: {
            type: [String],
            required: true,
            validate: {
                validator: function (v) {
                    return v.length === 4;
                },
                message: "brandsPreviewImage must contain exactly 4 images"
            }
        },
        servicesPreview: {
            type: [ServicePreviewSchema],
            required: true,
            validate: {
                validator: function (v) {
                    return v.length === 4;
                },
                message: "servicesPreview must contain exactly 4 services"
            }
        },
        hero: { type: String, required: true, trim: true },
        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

/* ---------- Indexes ---------- */
HomeSchema.index({ createdAt: -1 });

/* ---------- JSON clean ---------- */
HomeSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    return obj;
};

module.exports = mongoose.model("Home", HomeSchema);
