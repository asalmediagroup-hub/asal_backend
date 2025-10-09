const mongoose = require("mongoose");

const PermissionSchema = new mongoose.Schema(
    {
        subject: { type: String, required: true, trim: true },
        actions: {
            type: [
                {
                    type: String,
                    enum: ["create", "read", "update", "delete", "manage"],
                },
            ],
            default: [],
        },
    },
    { _id: false }
);

const RoleSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, unique: true, trim: true },
        description: { type: String, trim: true },
        permissions: { type: [PermissionSchema], default: [] },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

module.exports = mongoose.model("Role", RoleSchema);


