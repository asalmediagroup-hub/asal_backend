const bcrypt = require("bcryptjs");
const User = require("./modal");
const Role = require("../roles/modal");

// GET /api/users
exports.listUsers = async (req, res) => {
    try {
        const page = Math.max(parseInt(req.query.page || "1"), 1);
        const limit = Math.min(parseInt(req.query.limit || "20"), 100);
        const q = (req.query.q || "").trim();
        const filter = q
            ? { $or: [{ name: { $regex: q, $options: "i" } }, { email: { $regex: q, $options: "i" } }] }
            : {};

        const [items, total] = await Promise.all([
            User.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate("createdBy")
                .populate("role"),

            User.countDocuments(filter),
        ]);

        res.json({ status: "success", data: items, total, page, pages: Math.ceil(total / limit) });
    } catch (e) {
        res.status(500).json({ message: "Failed to fetch users" });
    }
};

// GET /api/users/:id
exports.getUser = async (req, res) => {
    const item = await User.findById(req.params.id).populate("role").populate("createdBy", "name email");
    if (!item) return res.status(404).json({ message: "User not found" });
    res.json({ status: "success", data: item });
};

// POST /api/users
exports.createUser = async (req, res) => {
    try {
        const { name, email, password, status, avatar, role } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ message: "name, email and password are required" });

        const exists = await User.findOne({ email });
        if (exists) return res.status(409).json({ message: "Email already in use" });

        const roleDoc = role ? await Role.findById(role) : null;
        console.log(req.user);
        if (role && !roleDoc) return res.status(400).json({ message: "Invalid role" });
        const item = await User.create({ name, email, password, status, avatar, role, createdBy: req.user?._id || null });
        res.status(201).json({ status: "success", data: item });
    } catch (e) {
        res.status(400).json({ message: "Create failed" });
    }
};

// PATCH /api/users/:id
exports.updateUser = async (req, res) => {
    try {
        const update = { ...req.body };
        if (update.role) {
            const roleDoc = await Role.findById(update.role);
            if (!roleDoc) return res.status(400).json({ message: "Invalid role" });
        }

        // Ensure unique email
        if (update.email) {
            const exists = await User.findOne({ email: update.email, _id: { $ne: req.params.id } });
            if (exists) return res.status(409).json({ message: "Email already in use" });
        }

        // Hash password if provided
        if (update.password) {
            const salt = await bcrypt.genSalt(10);
            update.password = await bcrypt.hash(update.password, salt);
        }

        const item = await User.findByIdAndUpdate(req.params.id, update, {
            new: true,
            runValidators: true,
            context: "query",
        }).populate("role").populate("createdBy", "name email");

        if (!item) return res.status(404).json({ message: "User not found" });
        res.json({ status: "success", data: item });
    } catch (e) {
        res.status(400).json({ message: "Update failed" });
    }
};

// DELETE /api/users/:id
exports.deleteUser = async (req, res) => {
    const item = await User.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: "User not found" });
    res.json({ message: "Deleted" });
};
