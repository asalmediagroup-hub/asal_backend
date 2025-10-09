const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const UserSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true, minlength: 6, select: false },
        role: { type: mongoose.Schema.Types.ObjectId, ref: "Role" },
        status: { type: String, enum: ["active", "suspended", "inactive"], default: "active" },
        avatar: String,
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
    { timestamps: true }
);

// Hash when created/changed
UserSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

UserSchema.methods.matchPassword = function (candidate) {
    return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.toJSON = function () {
    const obj = this.toObject({ versionKey: false });
    delete obj.password;
    return obj;
};

module.exports = mongoose.model("User", UserSchema);
